import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { texturedMat } from '../rendering/Textures';
import { CollisionWorld } from '../systems/Collision';
import { lakeFloorY } from './lake';
import {
  AUSSEN, blickYaw, DECKE, FallenArt, FallenPlan, HOEHE, INNEN, LAB_HALB, linie, MITTE, N, PLAN,
  RING, TEMPEL_DREHUNG, TOR_BREITE, TOR_HOEHE, TORHAUS_BREITE, TORHAUS_TIEFE, WAND, ZELLE,
  zellMitte, zuLokal, zuWelt,
} from './TempelPlan';

// Der Tiefentempel: eine versunkene, gestufte Tempelanlage am Seeboden.
//
// Von außen: ein breiter, mehrfach abgetreppter Sockel, darauf ein
// flacher Mauerblock mit Strebepfeilern, vier Ecktürmen und einem Dach
// aus drei Stufen, gekrönt von einem Aufsatz mit Zinnen und Spitze.
// Vorn ein vorspringendes Torhaus zwischen zwei Obelisken. Leuchtsteine
// in warmem Bernstein markieren Tor, Türme und Krone.
//
// Innen (Grundriss siehe TempelPlan.ts): der Umgang läuft einmal rund
// um das Labyrinth; dessen Eingang liegt dem Tor genau gegenüber. Im
// Labyrinth warten Fallen – Stachelfallen, Pendeläxte, Harpunen und
// Fallbeile –, unter der Decke hängen Luftblasen zum Durchatmen, in der
// Mitte liegt die Schatzkammer.
//
// Alles Mauerwerk ist achsenparallel (der Tempel dreht nur um
// Vielfache von 90°), die Kollisionsboxen entsprechen also genau der
// Optik. Die Fallen haben keine Kollision – sie verletzen nur.

const T = CONFIG.tiefentempel;
const F = T.fallen;
const P = CONFIG.player;

// Stein ist sehr dunkel (siehe Seabed.ts, ROCK_LIGHT): die Vertexfarbe
// hellt auf. Dunkler Basalt für die Mauern, Grünspan für Dächer und
// Kanten – dazu warmes Bernstein als Licht.
const LIGHT = 18;
const BASALT = [0x8a9096, 0x848b93, 0x8f9294, 0x7f868e];
const SOCKEL = [0x6f757c, 0x6a7077];
const GRUENSPAN = [0x7fa898, 0x76a090, 0x86a89a];
const BRONZE = [0xb08a58, 0xa8844f];
const BERNSTEIN = 0xffb13c;

const TOP = 21; // Höhe der Spitze über dem Tempelboden

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tinted(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function scaleUv(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return geo;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

// Sammelt Mauerwerk (Stein, mit Kollision) und Leuchtsteine (unbeleuchtet)
// in lokalen Koordinaten; `lokalZuWelt` bringt die Kollisionsboxen in
// die Welt.
class Bau {
  readonly stein: THREE.BufferGeometry[] = [];
  readonly leucht: THREE.BufferGeometry[] = [];
  private readonly farbe = new THREE.Color();

  constructor(
    private readonly collision: CollisionWorld,
    private readonly lokalZuWelt: THREE.Matrix4,
    private readonly rnd: () => number,
  ) {}

  ton(palette: number[], hell: number): THREE.Color {
    this.farbe.setHex(palette[Math.floor(this.rnd() * palette.length)]);
    this.farbe.offsetHSL(0, (this.rnd() - 0.5) * 0.05, (this.rnd() - 0.5) * 0.08);
    return this.farbe.multiplyScalar(LIGHT * hell);
  }

  // Achsenparalleler Quader, `y` = Unterkante. `hell` hebt Flächen an,
  // die nur von unten zu sehen sind (Decke): Sonne und Himmelslicht
  // erreichen sie nicht, sie würden sonst im Nebel verschwinden.
  box(
    x: number, y: number, z: number, w: number, h: number, d: number,
    palette: number[], fest = true, hell = 1,
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleUv(geo, Math.max(1, Math.round(Math.max(w, h, d) / 2.5)));
    tinted(geo, this.ton(palette, hell));
    geo.applyMatrix4(_m.makeTranslation(x, y + h / 2, z));
    this.stein.push(geo);
    if (fest) {
      const box = new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2),
      );
      this.collision.addBox(box.applyMatrix4(this.lokalZuWelt));
    }
  }

  // Leuchtstein (ohne Kollision, vom Licht unabhängig)
  glow(x: number, y: number, z: number, w: number, h: number, d: number, color = BERNSTEIN): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    tinted(geo, new THREE.Color(color));
    geo.applyMatrix4(_m.makeTranslation(x, y + h / 2, z));
    this.leucht.push(geo);
  }
}

// ---------- Fallen ----------

interface Falle extends FallenPlan {
  cx: number; // Zellmitte, lokal
  cz: number;
  gruppe: THREE.Group;
  // Animationsteile je Art
  teil: THREE.Object3D[];
  augen?: THREE.MeshBasicMaterial; // Harpune: Mündungen glühen vor dem Schuss
  // Zustand nach dem letzten animiere()
  aus: number; // Stacheln: ausgefahrene Länge
  winkel: number; // Axt
  beil: number; // Fallbeil: Unterkante
  pfeilC: number; // Harpune: Querlage der Pfeile (NaN = keiner in der Luft)
}

// Harpune: eine Salve aus 3×3 Pfeilen (entlang des Gangs × Höhe).
// Die Abstände sind kleiner als der Spieler: wer mitten in der Zelle
// ist, wenn die Salve fliegt, wird getroffen – egal in welcher Höhe.
const PFEILE: readonly [number, number][] = [-0.8, 0, 0.8].flatMap(
  (a) => [0.9, 2.5, 4.1].map((y) => [a, y] as [number, number]),
);
const HALB_GANG = (ZELLE - WAND) / 2; // halbe lichte Gangbreite
// Pendelaxt: Arm vom Drehpunkt bis AXT_BLATT, dann ein breites
// Klingenblatt bis AXT_ARM und darunter die halbrunde Schneide. Das
// Blatt ist so hoch, dass weder darüber noch darunter ein Taucher
// vorbeipasst – man muss den Takt abpassen.
const AXT_BLATT = 1.6;
const AXT_ARM = 3.2; // Drehpunkt bis Oberkante der Schneide
const AXT_R = 1.35; // Radius der halbrunden Schneide
const BEIL_H = 1.7;

// Takt 0..periode, pro Falle versetzt
function takt(zeit: number, periode: number, phase: number): number {
  const u = zeit / periode + phase;
  return (u - Math.floor(u)) * periode;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

// Gemeinsame Geometrien und Materialien aller Fallen
class FallenTeile {
  readonly stahl = new THREE.MeshLambertMaterial({ color: 0xa4aab2 });
  readonly dunkel = new THREE.MeshLambertMaterial({ color: 0x3e4349 });
  readonly rost = new THREE.MeshLambertMaterial({ color: 0x7a5238 });
  readonly eisen = new THREE.MeshLambertMaterial({ color: 0x8c9299 });
  readonly platte = new THREE.BoxGeometry(3.0, 0.05, 3.0);
  readonly stachelnHoch: THREE.BufferGeometry;
  readonly stachelnRunter: THREE.BufferGeometry;
  readonly arm = new THREE.BoxGeometry(0.14, AXT_ARM, 0.14).translate(0, -AXT_ARM / 2, 0);
  readonly nabe = new THREE.BoxGeometry(0.5, 0.4, 0.5);
  readonly klinge: THREE.BufferGeometry;
  readonly schiene = new THREE.BoxGeometry(0.3, HOEHE, 0.12).translate(0, HOEHE / 2, 0);
  readonly beil = new THREE.BoxGeometry(0.12, BEIL_H, HALB_GANG * 2 - 0.1).translate(0, BEIL_H / 2, 0);
  readonly schneide = new THREE.BoxGeometry(0.18, 0.16, HALB_GANG * 2 - 0.1).translate(0, 0.08, 0);
  readonly schussplatte = new THREE.BoxGeometry(2.6, 4.4, 0.08);
  readonly muendung = new THREE.BoxGeometry(0.24, 0.24, 0.1);
  readonly pfeil: THREE.BufferGeometry;

  constructor() {
    const L = F.stacheln.laenge;
    const kegel: THREE.BufferGeometry[] = [];
    for (const a of [-1.05, -0.35, 0.35, 1.05]) {
      for (const b of [-1.05, -0.35, 0.35, 1.05]) {
        kegel.push(new THREE.ConeGeometry(0.09, L, 4).translate(a, L / 2, b));
      }
    }
    this.stachelnHoch = mergeGeometries(kegel);
    this.stachelnRunter = this.stachelnHoch.clone().rotateX(Math.PI);
    for (const g of kegel) g.dispose();

    // Klingenblatt quer zum Gang, darunter die halbrunde Schneide
    const blatt = new THREE.BoxGeometry(0.1, AXT_ARM - AXT_BLATT, AXT_R * 2)
      .translate(0, -(AXT_ARM + AXT_BLATT) / 2, 0);
    const schneide = new THREE.CylinderGeometry(AXT_R, AXT_R, 0.1, 18, 1, false, 0, Math.PI)
      .rotateZ(-Math.PI / 2)
      .translate(0, -AXT_ARM, 0);
    this.klinge = mergeGeometries([blatt.toNonIndexed(), schneide.toNonIndexed()]);
    blatt.dispose();
    schneide.dispose();

    const schaft = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 5).rotateX(Math.PI / 2);
    const spitze = new THREE.ConeGeometry(0.07, 0.2, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.45);
    this.pfeil = mergeGeometries([schaft, spitze]);
    schaft.dispose();
    spitze.dispose();
  }
}

// ---------- Der Tempel ----------

export interface TempelTeleport {
  pos: THREE.Vector3; // Fußposition (Welt)
  yaw: number;
}

export class Tiefentempel {
  readonly group = new THREE.Group();
  private readonly weltZuLokal = new THREE.Matrix4();
  private readonly fallen: Falle[] = [];
  private zeit = 0;
  private schutz = 0; // Rest der Schutzzeit nach einem Treffer
  private readonly lokal = new THREE.Vector3();
  // Luftblasen: Perlen, die aus dem Boden zur Decke steigen
  private readonly perlen: THREE.Points;
  private readonly perlenStart: Float32Array;
  private readonly luftspiegel: THREE.MeshBasicMaterial;
  private fundamentUnten = -4;

  // Für den Stalker: Standplätze (Fußpunkt, Welt)
  readonly stalkerPlaetze: THREE.Vector3[] = [];
  // Für die Schatzkammer: Goldbarren (Welt)
  readonly schatzPlaetze: THREE.Vector3[] = [];
  // Grundriss für die Minimap (Welt-Rechtecke)
  readonly minimapFlaechen: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  constructor(scene: THREE.Scene, collision: CollisionWorld, private readonly onFalle: (art: FallenArt, schaden: number) => void) {
    this.group.position.set(T.x, T.boden, T.z);
    this.group.rotation.y = TEMPEL_DREHUNG;
    this.group.updateMatrixWorld(true);
    this.weltZuLokal.copy(this.group.matrixWorld).invert();
    scene.add(this.group);

    const bau = new Bau(collision, this.group.matrixWorld, mulberry32(T.seed ^ 0x51ed27));
    this.bauFundament(bau);
    this.bauHuelle(bau);
    this.bauDach(bau);
    this.bauTorhaus(bau);
    this.bauLabyrinth(bau);
    this.bauSchatzkammer(bau);
    this.perlenStart = new Float32Array(PLAN.luft.length * 14);
    const luft = this.bauLuftblasen(bau);
    this.perlen = luft.perlen;
    this.luftspiegel = luft.spiegel;

    const steinMat = texturedMat('stone.png', 1, 1);
    steinMat.vertexColors = true;
    const stein = mergeGeometries(bau.stein);
    for (const g of bau.stein) g.dispose();
    this.group.add(new THREE.Mesh(stein, steinMat));

    const leucht = mergeGeometries(bau.leucht);
    for (const g of bau.leucht) g.dispose();
    this.group.add(new THREE.Mesh(leucht, new THREE.MeshBasicMaterial({ vertexColors: true })));

    this.bauFallen();

    for (const p of PLAN.stalkerPlaetze) this.stalkerPlaetze.push(this.welt(p.x, 0, p.z));
    this.planeMinimap();
  }

  // Lokaler Punkt -> Welt
  welt(lx: number, ly: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const w = zuWelt(lx, lz);
    return out.set(w.x, T.boden + ly, w.z);
  }

  // Welt -> lokal (in `out`)
  private zuLokal(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const l = zuLokal(p.x, p.z);
    return out.set(l.x, p.y - T.boden, l.z);
  }

  // ---------- Bau ----------

  // Sockel: reicht bis unter den tiefsten Grund des Fußabdrucks, oben
  // zwei breite Stufen. Das Torhaus steht auf einem eigenen Vorbau.
  private bauFundament(b: Bau): void {
    let tiefst = 0;
    for (let x = -AUSSEN - 6; x <= AUSSEN + 6; x += 3) {
      for (let z = -AUSSEN - TORHAUS_TIEFE - 6; z <= AUSSEN + 6; z += 3) {
        const w = zuWelt(x, z);
        tiefst = Math.min(tiefst, lakeFloorY(w.x, w.z) - T.boden);
      }
    }
    const u = tiefst - 2;
    this.fundamentUnten = u;
    const A = AUSSEN;
    b.box(0, u, 0, 2 * A, -u, 2 * A, SOCKEL);
    b.box(0, u, 0, 2 * (A + 2), -0.6 - u, 2 * (A + 2), SOCKEL);
    b.box(0, u, 0, 2 * (A + 4), -1.4 - u, 2 * (A + 4), SOCKEL);
    // Vorbau fürs Torhaus und die Obelisken, davor eine Treppenstufe
    const vorn = A + TORHAUS_TIEFE + 3;
    b.box(0, u, -(A + vorn) / 2, 26, -u, vorn - A, SOCKEL);
    b.box(0, u, -(vorn + 1.2), 10, -0.7 - u, 2.4, SOCKEL);
  }

  // Außenwände mit Tor, Decke, Strebepfeiler, Glimmsteine im Umgang
  private bauHuelle(b: Bau): void {
    const A = AUSSEN;
    const I = INNEN;
    const H = HOEHE + DECKE;
    const dicke = A - I;
    const tor = TOR_BREITE / 2;
    // Rückwand und Front in voller Breite, Seitenwände dazwischen
    b.box(0, 0, (A + I) / 2, 2 * A, H, dicke, BASALT);
    b.box(-(A + tor) / 2, 0, -(A + I) / 2, A - tor, H, dicke, BASALT);
    b.box((A + tor) / 2, 0, -(A + I) / 2, A - tor, H, dicke, BASALT);
    b.box(0, TOR_HOEHE, -(A + I) / 2, TOR_BREITE, H - TOR_HOEHE, dicke, BASALT);
    b.box(-(A + I) / 2, 0, 0, dicke, H, 2 * I, BASALT);
    b.box((A + I) / 2, 0, 0, dicke, H, 2 * I, BASALT);
    // Decke über Umgang und Labyrinth
    b.box(0, HOEHE, 0, 2 * I, DECKE, 2 * I, BASALT, true, 2.6);
    // Deckenbalken quer über den Umgang, alle 6 m
    const lab = LAB_HALB + WAND / 2;
    const breite = I - lab;
    const mitte = (I + lab) / 2;
    for (let t = -30; t <= 30; t += 6) {
      for (const s of [-1, 1]) {
        b.box(t, HOEHE - 0.35, s * mitte, 0.5, 0.35, breite, BRONZE, true, 2.2);
        b.box(s * mitte, HOEHE - 0.35, t, breite, 0.35, 0.5, BRONZE, true, 2.2);
      }
    }

    // Strebepfeiler außen, im 8-m-Takt (vorn nicht am Torhaus)
    for (let t = -24; t <= 24; t += 8) {
      for (const s of [-1, 1]) {
        if (!(s < 0 && Math.abs(t) < TORHAUS_BREITE / 2 + 2)) {
          b.box(t, 0, s * (A + 0.5), 1.4, 7.6, 1.0, BASALT);
          b.box(t, 7.6, s * (A + 0.5), 1.8, 0.4, 1.4, GRUENSPAN);
        }
        b.box(s * (A + 0.5), 0, t, 1.0, 7.6, 1.4, BASALT);
        b.box(s * (A + 0.5), 7.6, t, 1.4, 0.4, 1.8, GRUENSPAN);
      }
    }

    // Glimmsteine an der Innenseite der Außenwand, alle 6 m
    for (let t = -30; t <= 30; t += 6) {
      if (Math.abs(t) > tor + 1) b.glow(t, 3, -I + 0.03, 0.4, 0.6, 0.06);
      b.glow(t, 3, I - 0.03, 0.4, 0.6, 0.06);
      b.glow(-I + 0.03, 3, t, 0.06, 0.6, 0.4);
      b.glow(I - 0.03, 3, t, 0.06, 0.6, 0.4);
    }
  }

  // Dach: drei Stufen, Krone mit Zinnen und Spitze, vier Ecktürme
  private bauDach(b: Bau): void {
    const A = AUSSEN;
    let y = HOEHE + DECKE;
    const stufen: [number, number, number[]][] = [
      [A - 1.5, 2.0, BASALT], [A - 7, 2.0, GRUENSPAN], [A - 13, 1.8, BASALT],
    ];
    for (const [halb, h, pal] of stufen) {
      b.box(0, y, 0, 2 * halb, h, 2 * halb, pal);
      y += h;
    }
    // Krone (y = 12 .. 16), Kappe, Spitze
    b.box(0, y, 0, 16, 4, 16, BASALT);
    for (const s of [-1, 1]) {
      // Leuchtbänder auf allen vier Seiten der Krone
      b.glow(0, y + 1.6, s * 8.03, 6, 0.5, 0.06);
      b.glow(s * 8.03, y + 1.6, 0, 0.06, 0.5, 6);
    }
    y += 4;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.box(sx * 7, y, sz * 7, 1.6, 2.8, 1.6, GRUENSPAN);
    }
    b.box(0, y, 0, 10, 2, 10, GRUENSPAN);
    b.box(0, y + 2, 0, 1.6, TOP - y - 2 - 0.8, 1.6, BRONZE);
    b.glow(0, TOP - 0.8, 0, 0.8, 0.8, 0.8);

    // Ecktürme: Körper auf dem Dach, Pfeiler an der Außenecke
    const turmY = HOEHE + DECKE;
    const turmTop = 13.7;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tx = sx * (A - 4.5);
        const tz = sz * (A - 4.5);
        b.box(tx, turmY, tz, 9, turmTop - turmY, 9, BASALT);
        b.box(sx * (A + 1), 0, sz * (A + 1), 2.6, turmTop + 0.5, 2.6, BASALT);
        b.box(tx, turmTop, tz, 7, 1.2, 7, GRUENSPAN);
        b.box(tx, turmTop + 1.2, tz, 4.5, 1.2, 4.5, GRUENSPAN);
        b.glow(tx, turmTop + 2.4, tz, 1, 0.6, 1);
        // zwei schmale Lichtschlitze je Außenseite
        for (const o of [-2, 2]) {
          b.glow(sx * (A + 0.03), 8.5, tz + o, 0.06, 2.2, 0.5);
          b.glow(tx + o, 8.5, sz * (A + 0.03), 0.5, 2.2, 0.06);
        }
      }
    }
  }

  // Torhaus mit Durchgang, Leuchtband über dem Tor, zwei Obelisken
  private bauTorhaus(b: Bau): void {
    const A = AUSSEN;
    const tor = TOR_BREITE / 2;
    const halb = TORHAUS_BREITE / 2;
    const zm = -(A + TORHAUS_TIEFE / 2);
    const hoch = 9.5;
    for (const s of [-1, 1]) {
      b.box(s * (tor + halb) / 2, 0, zm, halb - tor, hoch, TORHAUS_TIEFE, BASALT);
    }
    b.box(0, TOR_HOEHE, zm, TOR_BREITE, hoch - TOR_HOEHE, TORHAUS_TIEFE, BASALT);
    b.box(0, hoch, zm - 0.5, TORHAUS_BREITE + 2, 1.0, TORHAUS_TIEFE + 1, GRUENSPAN);
    b.box(0, hoch + 1, zm - 0.5, TORHAUS_BREITE - 3, 1.0, TORHAUS_TIEFE - 2, GRUENSPAN);
    const front = -(A + TORHAUS_TIEFE);
    b.glow(0, TOR_HOEHE + 0.5, front - 0.03, TOR_BREITE + 1, 0.3, 0.06);
    for (const s of [-1, 1]) {
      b.glow(s * (tor + 1.2), 1.2, front - 0.03, 0.4, 2.4, 0.06);
      // Obelisk
      b.box(s * 11, 0, front + 1, 2.2, 11, 2.2, BASALT);
      b.box(s * 11, 11, front + 1, 1.5, 1.4, 1.5, BRONZE);
      b.glow(s * 11, 12.4, front + 1, 0.7, 0.7, 0.7);
    }
  }

  // Labyrinth: Wandstücke zwischen den Pfosten. Keine Stücke
  // überlappen, damit keine Flächen ineinander flimmern.
  private bauLabyrinth(b: Bau): void {
    const lang = ZELLE - WAND;
    const rnd = mulberry32(T.seed ^ 0x2c1b3c6d);
    for (let li = 0; li <= N; li++) {
      for (let j = 0; j < N; j++) {
        if (!PLAN.wandV(li, j)) continue;
        b.box(linie(li), 0, zellMitte(j), WAND, HOEHE, lang, BASALT);
        if (rnd() < 0.18) {
          const s = rnd() < 0.5 ? -1 : 1;
          b.glow(linie(li) + s * (WAND / 2 + 0.03), 2.6, zellMitte(j), 0.06, 0.6, 0.35);
        }
      }
    }
    for (let i = 0; i < N; i++) {
      for (let lj = 0; lj <= N; lj++) {
        if (!PLAN.wandH(i, lj)) continue;
        b.box(zellMitte(i), 0, linie(lj), lang, HOEHE, WAND, BASALT);
        if (rnd() < 0.18) {
          const s = rnd() < 0.5 ? -1 : 1;
          b.glow(zellMitte(i), 2.6, linie(lj) + s * (WAND / 2 + 0.03), 0.35, 0.6, 0.06);
        }
      }
    }
    for (let li = 0; li <= N; li++) {
      for (let lj = 0; lj <= N; lj++) {
        if (PLAN.pfosten(li, lj)) b.box(linie(li), 0, linie(lj), WAND, HOEHE, WAND, BASALT);
      }
    }
    // Leuchtender Rahmen um den Labyrintheingang (Rückseite)
    const ex = zellMitte(PLAN.eingang);
    const ez = LAB_HALB + WAND / 2 + 0.03;
    b.glow(ex, HOEHE - 0.5, ez, lang, 0.25, 0.06);
    for (const s of [-1, 1]) b.glow(ex + s * (lang / 2 - 0.15), 0, ez, 0.25, HOEHE - 0.5, 0.06);
  }

  // Schatzkammer: Sockel in der Mitte, darauf und ringsum Goldbarren
  private bauSchatzkammer(b: Bau): void {
    const m = zellMitte(MITTE);
    b.box(m, 0, m, 2.4, 0.9, 2.4, BRONZE);
    b.glow(m, 0.9, m, 1.7, 0.04, 1.7, 0xffd27a);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // vier Säulen in der Kammer
        b.box(m + sx * 3.4, 0, m + sz * 3.4, 0.9, HOEHE, 0.9, GRUENSPAN);
        b.glow(m + sx * 3.4, 3.2, m + sz * (3.4 + 0.48), 0.3, 0.5, 0.06);
      }
    }
    const n = T.schatzGold;
    for (let k = 0; k < n; k++) {
      if (k < 4) {
        const sx = k % 2 === 0 ? -0.45 : 0.45;
        const sz = k < 2 ? -0.45 : 0.45;
        this.schatzPlaetze.push(this.welt(m + sx, 0.9 + 0.22, m + sz));
      } else {
        const a = ((k - 4) / Math.max(1, n - 4)) * Math.PI * 2 + Math.PI / 4;
        this.schatzPlaetze.push(this.welt(m + Math.sin(a) * 2.2, 0.22, m + Math.cos(a) * 2.2));
      }
    }
  }

  // Luftblasen: silbrig schimmernder Spiegel unter der Decke, ein
  // Bronzering im Boden, aus dem Perlen aufsteigen
  private bauLuftblasen(b: Bau): { perlen: THREE.Points; spiegel: THREE.MeshBasicMaterial } {
    const spiegel = new THREE.MeshBasicMaterial({
      color: 0xd8f0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    const scheibe = new THREE.CircleGeometry(T.luftRadius, 16).rotateX(Math.PI / 2);
    const perlenPos = new Float32Array(PLAN.luft.length * 14 * 3);
    const rnd = mulberry32(T.seed ^ 0x7f4a7c15);
    for (const [k, l] of PLAN.luft.entries()) {
      const m = new THREE.Mesh(scheibe, spiegel);
      m.position.set(l.x, HOEHE - 0.03, l.z);
      this.group.add(m);
      b.box(l.x, 0, l.z, 0.9, 0.06, 0.9, BRONZE, false);
      b.glow(l.x, 0.06, l.z, 0.5, 0.02, 0.5, 0x9fe0ff);
      for (let q = 0; q < 14; q++) {
        const i = (k * 14 + q) * 3;
        perlenPos[i] = l.x + (rnd() - 0.5) * 0.7;
        perlenPos[i + 1] = rnd() * HOEHE;
        perlenPos[i + 2] = l.z + (rnd() - 0.5) * 0.7;
        this.perlenStart[k * 14 + q] = 0.6 + rnd() * 0.8; // Steiggeschwindigkeit
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(perlenPos, 3));
    const perlen = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xe8f6ff, size: 0.12, transparent: true, opacity: 0.8 }),
    );
    perlen.frustumCulled = false;
    this.group.add(perlen);
    return { perlen, spiegel };
  }

  private bauFallen(): void {
    const teile = new FallenTeile();
    for (const plan of PLAN.fallen) {
      const g = new THREE.Group();
      const cx = zellMitte(plan.i);
      const cz = zellMitte(plan.j);
      g.position.set(cx, 0, cz);
      // Fallen-Rahmen: +x = entlang des Gangs, z = quer dazu
      if (plan.achse === 'z') g.rotation.y = Math.PI / 2;
      this.group.add(g);
      const f: Falle = {
        ...plan, cx, cz, gruppe: g, teil: [], aus: 0, winkel: 0, beil: HOEHE, pfeilC: NaN,
      };

      switch (plan.art) {
        case 'stacheln': {
          const boden = new THREE.Mesh(teile.platte, teile.dunkel);
          boden.position.y = 0.025;
          const decke = new THREE.Mesh(teile.platte, teile.dunkel);
          decke.position.y = HOEHE - 0.025;
          const hoch = new THREE.Mesh(teile.stachelnHoch, teile.stahl);
          const runter = new THREE.Mesh(teile.stachelnRunter, teile.stahl);
          g.add(boden, decke, hoch, runter);
          f.teil.push(hoch, runter);
          break;
        }
        case 'axt': {
          const drehpunkt = new THREE.Group();
          drehpunkt.position.y = HOEHE - 0.05;
          const nabe = new THREE.Mesh(teile.nabe, teile.dunkel);
          drehpunkt.add(
            new THREE.Mesh(teile.arm, teile.rost),
            new THREE.Mesh(teile.klinge, teile.stahl),
          );
          nabe.position.y = HOEHE - 0.2;
          g.add(nabe, drehpunkt);
          f.teil.push(drehpunkt);
          break;
        }
        case 'harpune': {
          const s = plan.seite;
          const platte = new THREE.Mesh(teile.schussplatte, teile.rost);
          platte.position.set(0, HOEHE / 2, s * (HALB_GANG - 0.04));
          g.add(platte);
          f.augen = new THREE.MeshBasicMaterial({ color: 0x3a0c08 });
          for (const [a, y] of PFEILE) {
            const m = new THREE.Mesh(teile.muendung, f.augen);
            m.position.set(a, y, s * (HALB_GANG - 0.12));
            const pfeil = new THREE.Mesh(teile.pfeil, teile.stahl);
            // Spitze zeigt von der Schusswand weg
            if (s < 0) pfeil.rotation.y = Math.PI;
            pfeil.position.set(a, y, 0);
            pfeil.visible = false;
            g.add(m, pfeil);
            f.teil.push(pfeil);
          }
          break;
        }
        case 'fallbeil': {
          for (const s of [-1, 1]) {
            const schiene = new THREE.Mesh(teile.schiene, teile.dunkel);
            schiene.position.z = s * (HALB_GANG - 0.06);
            g.add(schiene);
          }
          const beil = new THREE.Group();
          beil.add(new THREE.Mesh(teile.beil, teile.eisen), new THREE.Mesh(teile.schneide, teile.stahl));
          g.add(beil);
          f.teil.push(beil);
          break;
        }
      }
      this.fallen.push(f);
      this.animiere(f);
    }
  }

  private planeMinimap(): void {
    const rechteck = (x0: number, z0: number, x1: number, z1: number) => {
      const a = zuWelt(x0, z0);
      const c = zuWelt(x1, z1);
      this.minimapFlaechen.push({
        minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x),
        minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z),
      });
    };
    rechteck(-AUSSEN, -AUSSEN, AUSSEN, AUSSEN);
    rechteck(-TORHAUS_BREITE / 2, -AUSSEN - TORHAUS_TIEFE, TORHAUS_BREITE / 2, -AUSSEN);
  }

  // ---------- Fallen-Animation ----------

  private animiere(f: Falle): void {
    const t = this.zeit;
    switch (f.art) {
      case 'stacheln': {
        // kurz lugen die Spitzen heraus (Warnung), dann schießen sie
        // aus Boden und Decke, halten und ziehen sich zurück
        const L = F.stacheln.laenge;
        const u = takt(t, F.stacheln.periode, f.phase);
        f.aus = u < 0.55 ? 0.22
          : u < 0.67 ? lerp(0.22, L, (u - 0.55) / 0.12)
            : u < 1.6 ? L
              : u < 2.1 ? lerp(L, 0, (u - 1.6) / 0.5)
                : 0;
        f.teil[0].position.y = -L + f.aus;
        f.teil[1].position.y = HOEHE + L - f.aus;
        break;
      }
      case 'axt': {
        const u = takt(t, F.axt.periode, f.phase) / F.axt.periode;
        f.winkel = F.axt.winkel * Math.sin(u * Math.PI * 2);
        f.teil[0].rotation.z = f.winkel;
        break;
      }
      case 'harpune': {
        // 0,5 s glühen die Mündungen, dann fliegt die Salve quer über den Gang
        const u = takt(t, F.harpune.periode, f.phase);
        const s = f.seite;
        const flug = (HALB_GANG * 2 - 0.3) / F.harpune.tempo;
        f.augen!.color.setHex(u < 0.5 ? (Math.floor(u * 16) % 2 === 0 ? 0xff3a1c : 0xb01808) : 0x3a0c08);
        const inLuft = u >= 0.5 && u < 0.5 + flug;
        f.pfeilC = inLuft ? s * (HALB_GANG - 0.15) - s * F.harpune.tempo * (u - 0.5) : NaN;
        for (const p of f.teil) {
          p.visible = inLuft;
          if (inLuft) p.position.z = f.pfeilC;
        }
        break;
      }
      case 'fallbeil': {
        // ruht in der Decke, ruckelt kurz (Warnung), saust herab,
        // bleibt kurz unten und zieht sich wieder hoch
        const u = takt(t, F.fallbeil.periode, f.phase);
        const warn = HOEHE - 0.25;
        f.beil = u < 2.0 ? HOEHE
          : u < 2.45 ? warn + (Math.floor(u * 20) % 2) * 0.06
            : u < 2.6 ? lerp(warn, 0.02, (u - 2.45) / 0.15)
              : u < 2.9 ? 0.02
                : lerp(0.02, HOEHE, (u - 2.9) / (F.fallbeil.periode - 2.9));
        f.teil[0].position.y = f.beil;
        break;
      }
    }
  }

  // Trifft die Falle einen Spieler an lokaler Fußposition (x, y, z)?
  private trifft(f: Falle, x: number, y: number, z: number): boolean {
    const r = P.radius;
    const kopf = y + P.height;
    // in den Fallen-Rahmen: a entlang des Gangs, c quer dazu
    const dx = x - f.cx;
    const dz = z - f.cz;
    const a = f.achse === 'x' ? dx : -dz;
    const c = f.achse === 'x' ? dz : dx;
    switch (f.art) {
      case 'stacheln': {
        const L = F.stacheln.laenge;
        if (f.aus < L * 0.5 || Math.abs(a) > 1.5 + r || Math.abs(c) > 1.5 + r) return false;
        return y < f.aus || kopf > HOEHE - f.aus;
      }
      case 'axt': {
        // Spielerachse in den Rahmen der Klinge drehen und gegen die
        // halbrunde Klinge prüfen (an vier Punkten entlang des Körpers)
        const cos = Math.cos(f.winkel);
        const sin = Math.sin(f.winkel);
        for (let k = 0; k < 4; k++) {
          const v = y + (P.height * k) / 3 - (HOEHE - 0.05);
          const ar = a * cos + v * sin;
          const q = -(-a * sin + v * cos); // Abstand vom Drehpunkt entlang des Arms
          if (Math.abs(ar) > 0.06 + r) continue;
          // Abstand zum Blatt (Rechteck) und zur Schneide (Halbkreis)
          const blatt = Math.max(Math.abs(c) - AXT_R, AXT_BLATT - q, q - AXT_ARM);
          const schneide = q >= AXT_ARM
            ? Math.hypot(q - AXT_ARM, c) - AXT_R
            : Math.max(Math.abs(c) - AXT_R, AXT_ARM - q);
          if (Math.min(blatt, schneide) < r) return true;
        }
        return false;
      }
      case 'harpune': {
        if (Number.isNaN(f.pfeilC)) return false;
        for (const [pa, py] of PFEILE) {
          if (Math.abs(a - pa) < r + 0.05 && py > y - 0.05 && py < kopf + 0.05 &&
            Math.abs(c - f.pfeilC) < r + 0.4) return true;
        }
        return false;
      }
      case 'fallbeil':
        // das warnende Ruckeln unter der Decke verletzt noch nicht
        return f.beil < HOEHE - 0.3 && Math.abs(a) < 0.08 + r && Math.abs(c) < HALB_GANG + r &&
          kopf > f.beil && y < f.beil + BEIL_H;
    }
  }

  private schaden(art: FallenArt): number {
    return F[art].schaden;
  }

  // ---------- pro Bild ----------

  update(dt: number, spieler: THREE.Vector3): void {
    this.zeit += dt;
    this.schutz = Math.max(0, this.schutz - dt);
    const l = this.zuLokal(spieler, this.lokal);
    // Weit weg: nichts zu tun (unter Wasser sieht man ~30 m weit)
    if (Math.abs(l.x) > AUSSEN + 60 || Math.abs(l.z) > AUSSEN + 60) return;

    for (const f of this.fallen) {
      const nah = Math.abs(l.x - f.cx) < 40 && Math.abs(l.z - f.cz) < 40;
      if (!nah) continue;
      this.animiere(f);
      if (this.schutz > 0) continue;
      if (Math.abs(l.x - f.cx) > ZELLE * 1.5 || Math.abs(l.z - f.cz) > ZELLE * 1.5) continue;
      if (this.trifft(f, l.x, l.y, l.z)) {
        this.schutz = F.schutzZeit;
        this.onFalle(f.art, this.schaden(f.art));
      }
    }

    // Luftblasen schimmern, Perlen steigen
    this.luftspiegel.opacity = 0.42 + Math.sin(this.zeit * 2.3) * 0.08;
    const pos = this.perlen.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < this.perlenStart.length; k++) {
      let y = pos.getY(k) + this.perlenStart[k] * dt;
      if (y > HOEHE - 0.1) y = 0.1;
      pos.setY(k, y);
    }
    pos.needsUpdate = true;
  }

  // ---------- Abfragen ----------

  // Im begehbaren Innenraum (Umgang oder Labyrinth)?
  innen(p: THREE.Vector3): boolean {
    const l = this.zuLokal(p, _v);
    return PLAN.innen(l.x, l.y, l.z);
  }

  // Irgendwo im Bauwerk oder dicht daran (Sockel bis Spitze)?
  umschliesst(p: THREE.Vector3, marge = 0): boolean {
    const l = this.zuLokal(p, _v);
    const s = AUSSEN + 4 + marge;
    return Math.abs(l.x) < s && l.z < s && l.z > -(AUSSEN + TORHAUS_TIEFE + 5 + marge) &&
      l.y > this.fundamentUnten - marge && l.y < TOP + marge;
  }

  // Sichtlinie frei? Geprüft wird in 0,4-m-Schritten gegen Mauern,
  // Boden und Decke des Innenraums.
  sichtfrei(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const la = this.zuLokal(a, new THREE.Vector3());
    const lb = this.zuLokal(b, new THREE.Vector3());
    const dist = la.distanceTo(lb);
    const n = Math.ceil(dist / 0.4);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (PLAN.fest(
        la.x + (lb.x - la.x) * t, la.y + (lb.y - la.y) * t, la.z + (lb.z - la.z) * t,
      )) return false;
    }
    return true;
  }

  // Steckt der Kopf in einer Luftblase? Man muss dazu unter die Decke
  // hinaufschwimmen.
  inLuftblase(auge: THREE.Vector3): boolean {
    const l = this.zuLokal(auge, _v);
    if (l.y < HOEHE - 1.9 || l.y > HOEHE + 0.2) return false;
    for (const p of PLAN.luft) {
      if (Math.hypot(l.x - p.x, l.z - p.z) < T.luftRadius) return true;
    }
    return false;
  }

  // Teleportziele (Cheat-Menü)
  get vorDemTor(): TempelTeleport {
    return { pos: this.welt(0, 0.6, -(AUSSEN + TORHAUS_TIEFE + 7)), yaw: blickYaw(0, 1) };
  }

  get amLabyrinthEingang(): TempelTeleport {
    return { pos: this.welt(zellMitte(PLAN.eingang), 0.6, RING), yaw: blickYaw(0, -1) };
  }

  get inDerSchatzkammer(): TempelTeleport {
    const m = zellMitte(MITTE);
    return { pos: this.welt(m, 0.6, zellMitte(MITTE - 1)), yaw: blickYaw(0, 1) };
  }
}
