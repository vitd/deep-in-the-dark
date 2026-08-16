import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { texturedMat } from '../rendering/Textures';
import { CollisionWorld } from '../systems/Collision';
import { SEABED_ITEM_SPOTS } from './Resources';
import { insideLake, lakeFloorY, noise2, SEABED_MIN_DEPTH } from './lake';

// Bewuchs des Seebodens: loses Geröll und aufragende Felsklippen.
//
// Zwei Ebenen mit unterschiedlicher Lebensdauer:
//
// 1. Streufelsen (Kies bis Brocken) werden in Kacheln rund um den
//    Spieler erzeugt und beim Überqueren einer Kachelgrenze komplett
//    neu aufgebaut. So bleibt die Zahl gleichzeitig sichtbarer Steine
//    klein, obwohl der ganze 2-km-See bedeckt ist. Gezeichnet wird je
//    Felsform ein InstancedMesh – die Farbe steckt pro Instanz drin.
//    Diese Steine haben bewusst keine Kollision: an Kieseln würde man
//    beim Tauchen dauernd hängen bleiben.
//
// 2. Klippen/Erhebungen entstehen einmalig für den ganzen See, landen
//    in einer einzigen zusammengefassten Geometrie (Vertexfarben) und
//    bekommen Kollisionsboxen – um die muss man herumtauchen.
//
// Alles ist deterministisch aus der Position abgeleitet: derselbe Fleck
// Seeboden sieht nach der Rückkehr wieder genauso aus.

const L = CONFIG.world.lake;

// Kachelgröße und Sichtradius der Streufelsen. Der Radius liegt weit
// jenseits der Unterwasser-Sichtweite (Nebeldichte 0.075 => ~30 m),
// damit niemand Steine auftauchen sieht.
const CHUNK = 24;
const VIEW = 5; // Kachelradius => ~120 m, das Vierfache der Sichtweite
const CAP = 3000; // Instanzen je Felsform

// Steinfarben. stone.png ist mit einem Mittelwert von RGB 35 sehr
// dunkel gehalten – die Palette wirkt deshalb wie der `brightness`-
// Parameter in Textures.ts als Aufheller und wird mit ROCK_LIGHT
// hochskaliert. Ohne das multiplizieren sich zwei dunkle Faktoren und
// die Steine wären schwarze Silhouetten.
// Bewusst warme wie kühle Töne: der grünblaue Unterwassernebel frisst
// Farbunterschiede, weit auseinanderliegende Grundtöne bleiben eher
// als Abwechslung erkennbar.
const PALETTE = [
  0x8e8b84, 0x6e6a62, 0xa39a88, 0x7b6b55, 0x66705f,
  0x9a8f7c, 0x807a70, 0x8a8f9a, 0x7a5f48, 0x5f6b58,
];
const ROCK_LIGHT = 18;

// Flächen, die von Steinen frei bleiben. `minSize` filtert, ab welcher
// Steingröße die Zone überhaupt greift: Kies darf überall liegen, nur
// Brocken müssen vom Ankerplatz und vom Startpunkt wegbleiben.
interface ClearZone {
  x: number;
  z: number;
  r: number;
  minSize: number;
}

const KEEP_CLEAR: ClearZone[] = [
  // Fundstellen am Grund dürfen nicht unter Geröll verschwinden
  ...SEABED_ITEM_SPOTS.map((p) => ({ x: p.x, z: p.z, r: 1.3, minSize: 0 })),
  { x: CONFIG.world.spawn.x, z: CONFIG.world.spawn.z, r: 4, minSize: 1.2 },
  { x: CONFIG.world.boatPos.x, z: CONFIG.world.boatPos.z, r: 11, minSize: 1.2 },
];

// Kleiner, schneller PRNG (mulberry32) – aus einem Kachel- bzw.
// Rasterindex geseedet, damit dieselbe Stelle immer gleich ausfällt.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// UVs skalieren, damit die Steintextur unabhängig von der Objektgröße
// ungefähr gleich grob gepixelt bleibt.
function scaleUv(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return geo;
}

// Einfarbiges Vertexfarben-Attribut anlegen. Wird zweifach gebraucht:
// für die zu einer Geometrie verschmolzenen Klippen (dort gibt es kein
// Material pro Block mehr) und – weiß – für die Streufelsen. Three
// wertet `instanceColor` nämlich nur aus, wenn am Material auch
// `vertexColors` gesetzt ist (color_fragment.glsl multipliziert vColor
// ausschließlich unter USE_COLOR); ohne `color`-Attribut liefert WebGL
// dann den Vorgabewert Schwarz und alle Steine wären unsichtbar.
function tinted(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Wiederverwendete Rechenobjekte – pro Aufbau werden einige tausend
// Instanzen gesetzt, da lohnt es sich, nichts neu zu allozieren.
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class Seabed {
  // Je Felsform ein InstancedMesh; Index = Form * 2 + (grob ? 1 : 0).
  // Die zweite Variante hat gröber skalierte UVs für große Brocken.
  private readonly kinds: THREE.InstancedMesh[] = [];
  private readonly used: number[] = [];
  private chunkX = NaN;
  private chunkZ = NaN;

  constructor(scene: THREE.Scene, collision: CollisionWorld) {
    const shapes = [
      () => new THREE.BoxGeometry(1, 1, 1),
      () => new THREE.DodecahedronGeometry(0.55, 0),
      () => new THREE.IcosahedronGeometry(0.55, 0),
    ];
    const white = new THREE.Color(0xffffff);
    for (const make of shapes) {
      for (const uvScale of [1, 3]) {
        const mat = texturedMat('stone.png', 1, 1);
        mat.vertexColors = true; // schaltet die Farbe pro Instanz frei
        const mesh = new THREE.InstancedMesh(
          tinted(scaleUv(make(), uvScale), white),
          mat,
          CAP,
        );
        mesh.count = 0;
        // Die Steine liegen ringsum den Spieler – Culling brächte nichts
        // und die Bounding-Sphere müsste bei jedem Aufbau neu berechnet
        // werden.
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        this.kinds.push(mesh);
        this.used.push(0);
      }
    }

    this.buildOutcrops(scene, collision);
    // Startumgebung sofort aufbauen, damit im ersten Bild nichts fehlt
    this.update(new THREE.Vector3(CONFIG.world.spawn.x, 0, CONFIG.world.spawn.z));
  }

  // Baut die Streufelsen neu, sobald der Spieler eine Kachel weiterzieht.
  update(pos: THREE.Vector3): void {
    const cx = Math.floor(pos.x / CHUNK);
    const cz = Math.floor(pos.z / CHUNK);
    if (cx === this.chunkX && cz === this.chunkZ) return;
    this.chunkX = cx;
    this.chunkZ = cz;

    this.used.fill(0);
    for (let dz = -VIEW; dz <= VIEW; dz++) {
      for (let dx = -VIEW; dx <= VIEW; dx++) {
        if (dx * dx + dz * dz > VIEW * VIEW) continue; // runder Ausschnitt
        this.fillChunk(cx + dx, cz + dz);
      }
    }
    for (const [i, mesh] of this.kinds.entries()) {
      mesh.count = this.used[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private fillChunk(cx: number, cz: number): void {
    const rnd = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0);
    const bx = cx * CHUNK;
    const bz = cz * CHUNK;
    // Dichte großflächig moduliert: dünn besäte Sandflächen wechseln
    // sich mit dichten Geröllfeldern ab. Der Sockel ist bewusst hoch
    // genug, dass auch die ruhigsten Zonen noch steinig wirken.
    const rocky = noise2(bx / 190 + 4.5, bz / 190 - 9.1);
    const n = Math.round(22 + rocky * rocky * 52);

    for (let i = 0; i < n; i++) {
      const x = bx + rnd() * CHUNK;
      const z = bz + rnd() * CHUNK;
      // Größenklassen: Kies, Steine, Brocken. Der Anteil der beiden
      // größeren Klassen bestimmt, wie schroff der Grund wirkt – Kies
      // allein sieht aus der Tauchdistanz nur nach Sandkörnung aus.
      const t = rnd();
      const size = t < 0.45 ? 0.2 + rnd() * 0.45
        : t < 0.85 ? 0.7 + rnd() * 1.5
          : 2.4 + rnd() * 3.2;
      const shape = Math.floor(rnd() * 3);
      // Zufallszahlen immer vollständig ziehen, damit ein übersprungener
      // Stein die Folge für die nächsten nicht verschiebt
      const yaw = rnd() * Math.PI * 2;
      const tiltX = (rnd() - 0.5) * 0.5;
      const tiltZ = (rnd() - 0.5) * 0.5;
      const sx = size * (0.75 + rnd() * 0.5);
      const sy = size * (0.45 + rnd() * 0.8);
      const sz = size * (0.75 + rnd() * 0.5);
      const sink = 0.05 + rnd() * 0.2;
      const hue = rnd();
      const sat = rnd();
      const lum = rnd();
      const pal = Math.floor(rnd() * PALETTE.length);

      if (!insideLake(x, z, 2) || this.blocked(x, z, size)) continue;
      const kind = shape * 2 + (size > 1.5 ? 1 : 0);
      const idx = this.used[kind];
      if (idx >= CAP) continue;

      _e.set(tiltX, yaw, tiltZ);
      _q.setFromEuler(_e);
      _s.set(sx, sy, sz);
      // Steine sitzen zu gut einem Drittel im Sand, damit sie auf
      // geneigtem Grund nicht in der Luft schweben
      _p.set(x, lakeFloorY(x, z) + sy * sink, z);
      _m.compose(_p, _q, _s);

      const mesh = this.kinds[kind];
      mesh.setMatrixAt(idx, _m);
      _c.setHex(PALETTE[pal]);
      _c.offsetHSL((hue - 0.5) * 0.04, (sat - 0.5) * 0.15, (lum - 0.5) * 0.22);
      mesh.setColorAt(idx, _c.multiplyScalar(ROCK_LIGHT));
      this.used[kind] = idx + 1;
    }
  }

  private blocked(x: number, z: number, size: number): boolean {
    for (const k of KEEP_CLEAR) {
      if (size < k.minSize) continue;
      const r = k.r + size * 0.5;
      const dx = x - k.x;
      const dz = z - k.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // ---- Klippen: einmalig für den ganzen See, mit Kollision ----

  private buildOutcrops(scene: THREE.Scene, collision: CollisionWorld): void {
    const parts: THREE.BufferGeometry[] = [];
    const step = 62; // mittlerer Abstand des Rasters
    const span = Math.ceil(L.radius / step);

    for (let gz = -span; gz <= span; gz++) {
      for (let gx = -span; gx <= span; gx++) {
        const rnd = mulberry32((Math.imul(gx + 8123, 2654435761) ^ Math.imul(gz + 4231, 40503)) >>> 0);
        if (rnd() > 0.3) continue; // nur hie und da eine Klippe
        const x = L.center.x + gx * step + (rnd() - 0.5) * step * 0.8;
        const z = L.center.z + gz * step + (rnd() - 0.5) * step * 0.8;
        if (!insideLake(x, z, 25)) continue;

        const w = 3 + rnd() * 7;
        const d = 3 + rnd() * 7;
        if (this.blocked(x, z, Math.max(w, d))) continue;

        const floorY = lakeFloorY(x, z);
        // Nach oben ist bei SEABED_MIN_DEPTH Schluss – am flachen Schelf
        // werden daraus niedrige Riffe, in der Tiefe echte Felsnadeln.
        const headroom = CONFIG.world.seaLevel - SEABED_MIN_DEPTH - floorY;
        if (headroom < 2.5) continue;
        const h = Math.min(3 + rnd() * 12, headroom);

        _c.setHex(PALETTE[Math.floor(rnd() * PALETTE.length)]);
        _c.offsetHSL(0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.16);
        _c.multiplyScalar(ROCK_LIGHT);

        // Kernblock: unrotiert, damit seine AABB exakt der Optik
        // entspricht. Er reicht 2 m unter den Sand, damit am Hang keine
        // Lücke aufklafft.
        const top = floorY + h;
        const bottom = floorY - 2;
        parts.push(this.blockGeo(x, (top + bottom) / 2, z, w, top - bottom, d, 0, _c));
        collision.addBox(new THREE.Box3(
          new THREE.Vector3(x - w / 2, bottom, z - d / 2),
          new THREE.Vector3(x + w / 2, top, z + d / 2),
        ));

        // Trabanten brechen die Silhouette auf. Sie werden um y gedreht,
        // deshalb bekommt die Kollisionsbox nur die einbeschriebene
        // Grundfläche – lieber durch eine Ecke tauchen können als an
        // unsichtbarem Fels hängen bleiben.
        const sats = 2 + Math.floor(rnd() * 4);
        for (let s = 0; s < sats; s++) {
          const ang = rnd() * Math.PI * 2;
          const dist = (0.35 + rnd() * 0.5) * Math.max(w, d);
          const px = x + Math.cos(ang) * dist;
          const pz = z + Math.sin(ang) * dist;
          if (!insideLake(px, pz, 20) || this.blocked(px, pz, 4)) continue;
          const pw = 1.5 + rnd() * 4;
          const pd = 1.5 + rnd() * 4;
          const yaw = rnd() * Math.PI * 2;
          const pFloor = lakeFloorY(px, pz);
          const ph = Math.min(
            h * (0.25 + rnd() * 0.55),
            CONFIG.world.seaLevel - SEABED_MIN_DEPTH - pFloor,
          );
          if (ph < 1) continue;
          _c.setHex(PALETTE[Math.floor(rnd() * PALETTE.length)]);
          _c.offsetHSL(0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.18);
          _c.multiplyScalar(ROCK_LIGHT);
          const pTop = pFloor + ph;
          const pBottom = pFloor - 1.5;
          parts.push(
            this.blockGeo(px, (pTop + pBottom) / 2, pz, pw, pTop - pBottom, pd, yaw, _c),
          );
          if (pw >= 2.5 && pd >= 2.5 && ph >= 2.5) {
            const half = Math.min(pw, pd) / 2;
            collision.addBox(new THREE.Box3(
              new THREE.Vector3(px - half, pBottom, pz - half),
              new THREE.Vector3(px + half, pTop, pz + half),
            ));
          }
        }
      }
    }

    if (parts.length === 0) return;
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const mat = texturedMat('stone.png', 1, 1);
    mat.vertexColors = true;
    scene.add(new THREE.Mesh(merged, mat));
  }

  // Ein Felsblock als fertig platzierte Geometrie (die Klippen werden
  // anschließend zu einer einzigen Geometrie verschmolzen).
  private blockGeo(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    yaw: number, color: THREE.Color,
  ): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleUv(geo, Math.max(1, Math.round(Math.max(w, h, d) / 2.5)));
    tinted(geo, color);
    _e.set(0, yaw, 0);
    geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1)));
    return geo;
  }
}
