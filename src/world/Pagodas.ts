import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { texturedMat } from '../rendering/Textures';
import { CollisionWorld } from '../systems/Collision';
import { SEABED_ITEM_SPOTS } from './Resources';
import { insideLake, lakeFloorY, SEABED_MIN_DEPTH } from './lake';

// Versunkene Pagoden am Seeboden – über den ganzen See verstreut.
//
// Zwei Bauarten:
// - klein: 3×3 m Säulenstellung mit vier Säulen, ein Dach
// - groß: ~6,5×6,5 m mit acht Säulen (Ecken + Seitenmitten), darauf ein
//   geschlossenes Obergeschoss und ein zweites Dach
//
// Die Standorte kommen aus einem gestreuten Raster über den See
// (`planPagodas`), deterministisch aus dem Rasterindex geseedet – wie
// die Klippen in Seabed.ts. Alle Teile wandern in eine einzige
// zusammengefasste Geometrie mit Vertexfarben; gezeichnet wird die
// Steintextur. Sockel, Säulen, Gebälk, Dachkern und Obergeschoss
// bekommen Kollisionsboxen (die Pagoden stehen achsenparallel, damit
// die AABBs genau der Optik entsprechen): man taucht zwischen den
// Säulen hindurch, aber nicht durch Mauern.

const L = CONFIG.world.lake;
const P = CONFIG.pagoden;

// Ausgebleichter Stein für Sockel und Säulen, dunklere Töne für die
// Dächer. Die Faktoren wie in Seabed.ts: stone.png ist sehr dunkel und
// die Vertexfarbe dient als Aufheller (siehe dort, ROCK_LIGHT).
const STONE = [0x9c9a90, 0x8f8c82, 0xa6a08e, 0x8a9088];
const ROOF = [0x6e4c3f, 0x5f4b42, 0x546258, 0x655044];
const LIGHT = 18;

// Maße je Bauart, in Metern (vor der zufälligen Skalierung).
// `a` = halbe Seitenlänge des Säulenquadrats (Säulenmitten).
interface Plan {
  a: number;
  col: number; // Säulenquerschnitt
  colH: number;
  cols: 4 | 8;
  plinthH: number;
  beamH: number; // Gebälk-/Traufplatte
  roofH: number;
  storey: number; // halbe Breite des Obergeschosses (0 = keins)
  storeyH: number;
  roof2H: number;
  finialH: number;
}

const SMALL: Plan = {
  a: 1.5, col: 0.32, colH: 2.6, cols: 4, plinthH: 0.35, beamH: 0.25,
  roofH: 1.5, storey: 0, storeyH: 0, roof2H: 0, finialH: 0.7,
};
const LARGE: Plan = {
  a: 3.25, col: 0.46, colH: 3.6, cols: 8, plinthH: 0.6, beamH: 0.35,
  roofH: 1.9, storey: 1.8, storeyH: 2.2, roof2H: 1.6, finialH: 0.9,
};

// Gesamthöhe über dem Sockelboden
function planHeight(p: Plan): number {
  return p.plinthH + p.colH + p.beamH + p.roofH
    + (p.storey > 0 ? p.storeyH + p.beamH + p.roof2H : 0) + p.finialH;
}

export interface PagodaSpot {
  x: number;
  z: number;
  gross: boolean;
  scale: number;
  sink: number; // wie tief der Sockel im Sand steckt
  seed: number;
  r: number; // Freihalte-Radius für Geröll und Klippen (Seabed.ts)
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Flächen, die frei bleiben: Fundstellen, Startpunkt, Ankerplatz
const KEEP_CLEAR = [
  ...SEABED_ITEM_SPOTS.map((p) => ({ x: p.x, z: p.z, r: 3 })),
  { x: CONFIG.world.spawn.x, z: CONFIG.world.spawn.z, r: 12 },
  { x: CONFIG.world.boatPos.x, z: CONFIG.world.boatPos.z, r: 30 },
  // Tiefentempel samt Sockel und Mulde
  { x: CONFIG.tiefentempel.x, z: CONFIG.tiefentempel.z, r: CONFIG.tiefentempel.mulde * 1.45 },
];

function blocked(x: number, z: number, half: number): boolean {
  for (const k of KEEP_CLEAR) {
    const r = k.r + half;
    const dx = x - k.x;
    const dz = z - k.z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Standorte planen, in zwei Schritten:
//
// 1. Kandidaten aus einem gestreuten Raster über den See – jede Zelle
//    höchstens einer, verschoben um bis zu ±45 % der Rasterweite. Die
//    Rasterweite wird so lange verfeinert, bis genug Kandidaten im See
//    liegen (Randzellen und Freihaltezonen fallen aus).
// 2. Die Kandidaten in zufälliger, aber fester Reihenfolge durchgehen:
//    zuerst die großen Pagoden vergeben (wo Wassertiefe und Platz
//    reichen), dann die kleinen, bis die Zielzahlen aus CONFIG erreicht
//    sind. So stimmen die Zahlen unabhängig davon, wie viele Zellen am
//    Küstenschelf zu flach für eine große Pagode sind.
interface Candidate {
  x: number;
  z: number;
  seed: number;
  order: number;
  scaleK: number; // Zufallswerte für Skalierung und Einsinktiefe, je Bauart ausgewertet
  sinkK: number;
  headroom: number; // Wasserraum über dem Sand bis SEABED_MIN_DEPTH
}

function gatherCandidates(step: number): Candidate[] {
  const out: Candidate[] = [];
  const usable = L.radius - P.uferAbstand;
  const span = Math.ceil(usable / step);
  for (let gz = -span; gz <= span; gz++) {
    for (let gx = -span; gx <= span; gx++) {
      const seed = (Math.imul(gx + 5171, 1597334677) ^ Math.imul(gz + 9157, 3812015801)) >>> 0;
      const rnd = mulberry32(seed);
      const x = L.center.x + gx * step + (rnd() - 0.5) * step * 0.9;
      const z = L.center.z + gz * step + (rnd() - 0.5) * step * 0.9;
      const order = rnd();
      const scaleK = rnd();
      const sinkK = rnd();
      if (!insideLake(x, z, P.uferAbstand)) continue;
      // Nach oben ist bei SEABED_MIN_DEPTH Schluss (siehe lake.ts)
      const headroom = CONFIG.world.seaLevel - SEABED_MIN_DEPTH - lakeFloorY(x, z);
      out.push({ x, z, seed, order, scaleK, sinkK, headroom });
    }
  }
  return out;
}

function planPagodas(): PagodaSpot[] {
  const spots: PagodaSpot[] = [];
  const total = P.klein + P.gross;
  if (total <= 0) return spots;
  const usable = L.radius - P.uferAbstand;

  // Rasterweite: rechnerisch `total` Zellen im Kreis, dann schrittweise
  // enger, bis genug Kandidaten übrig sind (mit etwas Reserve für
  // Freihaltezonen und zu flache Stellen)
  let step = Math.sqrt((Math.PI * usable * usable) / total);
  let cands = gatherCandidates(step);
  for (let i = 0; i < 12 && cands.length < total * 1.3; i++) {
    step *= 0.93;
    cands = gatherCandidates(step);
  }
  cands.sort((a, b) => a.order - b.order);

  // Der Sockel steckt zu 10–75 % im Sand – nie ganz, ein Stück Sockel
  // soll immer herausschauen
  const sinkFor = (c: Candidate, gross: boolean, scale: number): number =>
    (gross ? LARGE : SMALL).plinthH * scale * (0.1 + c.sinkK * 0.65);
  const fits = (c: Candidate, gross: boolean, scale: number): boolean => {
    const plan = gross ? LARGE : SMALL;
    if (planHeight(plan) * scale > c.headroom + sinkFor(c, gross, scale)) return false;
    return !blocked(c.x, c.z, (plan.a + 1.1) * scale);
  };
  const push = (c: Candidate, gross: boolean, scale: number) => {
    const half = ((gross ? LARGE : SMALL).a + 1.1) * scale;
    spots.push({
      x: c.x, z: c.z, gross, scale, sink: sinkFor(c, gross, scale), seed: c.seed, r: half + 1,
    });
  };

  const rest: Candidate[] = [];
  let gross = 0;
  for (const c of cands) {
    const scale = 0.9 + c.scaleK * 0.25;
    if (gross < P.gross && fits(c, true, scale)) {
      push(c, true, scale);
      gross++;
    } else {
      rest.push(c);
    }
  }
  let klein = 0;
  for (const c of rest) {
    if (klein >= P.klein) break;
    const scale = 0.85 + c.scaleK * 0.4;
    if (!fits(c, false, scale)) continue;
    push(c, false, scale);
    klein++;
  }
  return spots;
}

// Einmal beim Laden geplant; Seabed.ts hält diese Flecken frei.
export const PAGODA_SPOTS: readonly PagodaSpot[] = planPagodas();

// ---- Geometrie ----

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

function tinted(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// UVs skalieren, damit die Textur unabhängig von der Teilgröße etwa
// gleich grob gepixelt bleibt
function scaleUv(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return geo;
}

class Builder {
  readonly parts: THREE.BufferGeometry[] = [];

  constructor(private readonly collision: CollisionWorld) {}

  // Achsenparalleler Quader, `y` = Unterkante
  box(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color: THREE.Color, solid: boolean,
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleUv(geo, Math.max(1, Math.round(Math.max(w, h, d) / 2)));
    tinted(geo, color);
    geo.applyMatrix4(_m.makeTranslation(x, y + h / 2, z));
    this.parts.push(geo);
    if (solid) {
      this.collision.addBox(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2),
      ));
    }
  }

  // Quadratischer Pyramidenstumpf (Dach), `y` = Unterkante, `halfBottom`
  // und `halfTop` = halbe Seitenlängen. Kollision bekommt nur der
  // innere Kern – lieber eine Dachkante durchtauchen als an
  // unsichtbarer Luft hängen bleiben.
  roof(
    x: number, y: number, z: number,
    halfBottom: number, halfTop: number, h: number,
    color: THREE.Color,
  ): void {
    const geo = new THREE.CylinderGeometry(halfTop * Math.SQRT2, halfBottom * Math.SQRT2, h, 4, 1);
    scaleUv(geo, Math.max(1, Math.round(halfBottom)));
    tinted(geo, color);
    geo.rotateY(Math.PI / 4);
    geo.applyMatrix4(_m.makeTranslation(x, y + h / 2, z));
    this.parts.push(geo);
    const core = (halfBottom + halfTop) / 2;
    this.collision.addBox(new THREE.Box3(
      new THREE.Vector3(x - core, y, z - core),
      new THREE.Vector3(x + core, y + h, z + core),
    ));
  }
}

function pick(rnd: () => number, palette: number[], out: THREE.Color): THREE.Color {
  out.setHex(palette[Math.floor(rnd() * palette.length)]);
  out.offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.14);
  return out.multiplyScalar(LIGHT);
}

function buildPagoda(b: Builder, spot: PagodaSpot): void {
  const rnd = mulberry32(spot.seed ^ 0x9e3779b9);
  const p = spot.gross ? LARGE : SMALL;
  const k = spot.scale;
  const { x, z } = spot;
  const stone = pick(rnd, STONE, new THREE.Color());
  const roof = pick(rnd, ROOF, _c).clone();

  // Sockel: reicht 1,5 m unter den Sand, damit am Hang keine Lücke
  // aufklafft; obendrauf sitzt alles Weitere.
  const ground = lakeFloorY(x, z) - spot.sink;
  const a = p.a * k;
  const plinthHalf = a + 0.5 * k;
  const plinthTop = ground + p.plinthH * k;
  b.box(x, ground - 1.5, z, plinthHalf * 2, plinthTop - (ground - 1.5), plinthHalf * 2, stone, true);
  if (spot.gross) {
    // untere, breitere Stufe
    const stepHalf = a + 1.1 * k;
    b.box(x, ground - 1.5, z, stepHalf * 2, 1.5 + p.plinthH * k * 0.5, stepHalf * 2, stone, true);
  }

  // Säulen: Ecken, bei der großen Bauart zusätzlich die Seitenmitten
  const col = p.col * k;
  const colH = p.colH * k;
  const offsets: [number, number][] = [[-a, -a], [a, -a], [-a, a], [a, a]];
  if (p.cols === 8) offsets.push([0, -a], [0, a], [-a, 0], [a, 0]);
  for (const [ox, oz] of offsets) {
    b.box(x + ox, plinthTop, z + oz, col, colH, col, stone, true);
  }

  // Gebälk und erstes Dach
  let y = plinthTop + colH;
  const beamHalf = a + 0.9 * k;
  b.box(x, y, z, beamHalf * 2, p.beamH * k, beamHalf * 2, roof, true);
  y += p.beamH * k;
  const roofHalf = a + 1.1 * k;
  if (p.storey > 0) {
    // Dachstumpf, darauf das geschlossene Obergeschoss, zweites Dach
    const storeyHalf = p.storey * k;
    b.roof(x, y, z, roofHalf, storeyHalf + 0.3 * k, p.roofH * k, roof);
    y += p.roofH * k;
    b.box(x, y, z, storeyHalf * 2, p.storeyH * k, storeyHalf * 2, stone, true);
    y += p.storeyH * k;
    const beam2Half = storeyHalf + 0.8 * k;
    b.box(x, y, z, beam2Half * 2, p.beamH * k, beam2Half * 2, roof, true);
    y += p.beamH * k;
    b.roof(x, y, z, storeyHalf + 1.0 * k, 0.25 * k, p.roof2H * k, roof);
    y += p.roof2H * k;
  } else {
    b.roof(x, y, z, roofHalf, 0.25 * k, p.roofH * k, roof);
    y += p.roofH * k;
  }

  // Dachspitze
  b.box(x, y, z, 0.28 * k, p.finialH * k, 0.28 * k, stone, false);
}

export function buildPagodas(scene: THREE.Scene, collision: CollisionWorld): void {
  const b = new Builder(collision);
  for (const spot of PAGODA_SPOTS) buildPagoda(b, spot);
  if (b.parts.length === 0) return;
  const merged = mergeGeometries(b.parts);
  for (const g of b.parts) g.dispose();
  const mat = texturedMat('stone.png', 1, 1);
  mat.vertexColors = true;
  scene.add(new THREE.Mesh(merged, mat));
}
