import * as THREE from 'three';
import { DECK_Y } from './boatLayout';

// Prozeduraler Schiffsrumpf aus Querschnitten (Spanten) statt aus Kisten.
// Die Breite folgt einer Stationstabelle (spitzer Bug, breite Mitte,
// verjüngtes Heck), jeder Spant ist unten gerundet und oben leicht
// eingezogen. Bug und Heck sind nach außen geneigt (Sprung/Rake).
//
// Lokales Koordinatensystem wie im Layout: x = Backbord(-)/Steuerbord(+),
// z = Bug(-)/Heck(+), y = Höhe (Deck bei DECK_Y).

export const BOW_Z = -16.5;
export const STERN_Z = 12.5;
export const KEEL_Y = -1.7;

// Halbe Rumpfbreite an Längsposition z. Die Werte sind so gewählt, dass
// der Aufbau (x bis ±2.95, z -11.15..8.15) überall im Rumpf liegt.
const STATIONS: { z: number; w: number }[] = [
  { z: -16.5, w: 0.10 },
  { z: -15.6, w: 0.95 },
  { z: -14.2, w: 1.95 },
  { z: -12.6, w: 2.75 },
  { z: -11.2, w: 3.20 },
  { z: -9.0, w: 3.62 },
  { z: -6.0, w: 3.90 },
  { z: -1.0, w: 4.00 },
  { z: 4.0, w: 3.94 },
  { z: 8.0, w: 3.74 },
  { z: 11.0, w: 3.56 },
  { z: 12.5, w: 3.5 }, // breites Heck: Spiegelheck statt Spitze
];

export function halfWidth(z: number): number {
  if (z <= STATIONS[0].z) return STATIONS[0].w;
  const last = STATIONS[STATIONS.length - 1];
  if (z >= last.z) return last.w;
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i];
    const b = STATIONS[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      // weiche Interpolation, damit keine Knicke in der Bordwand entstehen
      const s = t * t * (3 - 2 * t);
      return a.w + (b.w - a.w) * s;
    }
  }
  return last.w;
}

// Spantquerschnitt: Breitenfaktor und Höhe, von der Deckskante bis zum Kiel.
const SECTION: { f: number; y: number }[] = [
  { f: 0.99, y: DECK_Y },
  { f: 1.0, y: 0.7 },
  { f: 0.97, y: 0.1 },
  { f: 0.88, y: -0.45 },
  { f: 0.68, y: -0.95 },
  { f: 0.38, y: -1.35 },
  { f: 0.0, y: KEEL_Y },
];

const RING = SECTION.length * 2 - 1;

// Bug und Heck neigen sich nach außen: oben weiter vorn/hinten als am Kiel.
export function rake(z: number, y: number): number {
  const h = y - KEEL_Y;
  if (z < -11) {
    const f = Math.min(1, (-11 - z) / 5.5);
    return -f * h * 0.52;
  }
  if (z > 8) {
    const f = Math.min(1, (z - 8) / 4.5);
    return f * h * 0.22;
  }
  return 0;
}

const SEGMENTS = 44;

export function stationZ(i: number): number {
  return BOW_Z + ((STERN_Z - BOW_Z) * i) / SEGMENTS;
}

// Deckskante an Längsposition z (die Linie, auf der Reling und Deck enden)
export function deckEdge(z: number): { x: number; z: number } {
  return { x: halfWidth(z) * SECTION[0].f, z: z + rake(z, DECK_Y) };
}

function ringAt(z: number): THREE.Vector3[] {
  const w = halfWidth(z);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < SECTION.length; i++) {
    const s = SECTION[i];
    pts.push(new THREE.Vector3(-s.f * w, s.y, z + rake(z, s.y)));
  }
  for (let i = SECTION.length - 2; i >= 0; i--) {
    const s = SECTION[i];
    pts.push(new THREE.Vector3(s.f * w, s.y, z + rake(z, s.y)));
  }
  return pts;
}

// ---- Rumpfschale ----
export function buildHullMesh(material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= SEGMENTS; i++) rings.push(ringAt(stationZ(i)));

  const push = (p: THREE.Vector3, u: number, v: number) => {
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
  };

  for (let i = 0; i < SEGMENTS; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const v0 = (i / SEGMENTS) * 7;
    const v1 = ((i + 1) / SEGMENTS) * 7;
    for (let j = 0; j < RING - 1; j++) {
      const u0 = (j / (RING - 1)) * 2;
      const u1 = ((j + 1) / (RING - 1)) * 2;
      // Winding so, dass die Normalen nach AUSSEN zeigen – sonst ist die
      // Außenhaut weggecullt und man sieht ins Schiff hinein.
      push(a[j], u0, v0);
      push(b[j + 1], u1, v1);
      push(b[j], u0, v1);
      push(a[j], u0, v0);
      push(a[j + 1], u1, v0);
      push(b[j + 1], u1, v1);
    }
  }

  // Heckspiegel und Bugspitze schließen. Der Mittelpunkt ist der
  // Schwerpunkt des Spants – sonst wölbt sich der Deckel kegelförmig nach
  // außen und das Heck läuft spitz zu.
  const capRing = (ring: THREE.Vector3[], flip: boolean) => {
    const c = new THREE.Vector3();
    for (const p of ring) c.add(p);
    c.multiplyScalar(1 / ring.length);
    for (let j = 0; j < RING - 1; j++) {
      push(c, 0.5, 0.5);
      push(ring[flip ? j : j + 1], 0, 1);
      push(ring[flip ? j + 1 : j], 1, 1);
    }
  };
  capRing(rings[SEGMENTS], false); // Heckspiegel
  capRing(rings[0], true); // Vorsteven

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// ---- Deck (begehbare Fläche in Rumpfform) ----
export function buildDeckMesh(material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const e0 = deckEdge(stationZ(i));
    const e1 = deckEdge(stationZ(i + 1));
    const p = [
      new THREE.Vector3(-e0.x, DECK_Y, e0.z),
      new THREE.Vector3(e0.x, DECK_Y, e0.z),
      new THREE.Vector3(e1.x, DECK_Y, e1.z),
      new THREE.Vector3(-e1.x, DECK_Y, e1.z),
    ];
    const quad = [p[0], p[1], p[2], p[0], p[2], p[3]];
    for (const q of quad) {
      pos.push(q.x, q.y, q.z);
      uv.push(q.x / 2.2, q.z / 2.2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// ---- Schanzkleid (gebogene Reling entlang der Deckskante) ----
export interface Gap {
  side: -1 | 1;
  z0: number;
  z1: number;
}

// Höhe des Schanzkleids: vorn höher (Sprung), achtern niedriger
export function bulwarkHeight(z: number): number {
  if (z < -11) return 0.95 + Math.min(1, (-11 - z) / 5.5) * 0.55;
  if (z > 4) return Math.max(0.62, 0.95 - ((z - 4) / 8) * 0.33);
  return 0.95;
}

function inGap(side: number, z: number, gaps: Gap[]): boolean {
  return gaps.some((g) => g.side === side && z >= g.z0 && z <= g.z1);
}

export function buildBulwarkMesh(material: THREE.Material, gaps: Gap[]): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < SEGMENTS; i++) {
      const z0 = stationZ(i);
      const z1 = stationZ(i + 1);
      if (inGap(side, z0, gaps) || inGap(side, z1, gaps)) continue;
      const e0 = deckEdge(z0);
      const e1 = deckEdge(z1);
      const h0 = bulwarkHeight(z0);
      const h1 = bulwarkHeight(z1);
      // Oberkante leicht nach innen geneigt
      const a = new THREE.Vector3(side * e0.x, DECK_Y, e0.z);
      const b = new THREE.Vector3(side * e0.x * 0.94, DECK_Y + h0, e0.z);
      const c = new THREE.Vector3(side * e1.x * 0.94, DECK_Y + h1, e1.z);
      const d = new THREE.Vector3(side * e1.x, DECK_Y, e1.z);
      const v0 = (i / SEGMENTS) * 7;
      const v1 = ((i + 1) / SEGMENTS) * 7;
      const quad: [THREE.Vector3, number, number][] = [
        [a, 0, v0], [b, 1, v0], [c, 1, v1],
        [a, 0, v0], [c, 1, v1], [d, 0, v1],
      ];
      for (const [p, u, v] of quad) {
        pos.push(p.x, p.y, p.z);
        uv.push(u, v);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// ---- Kollision: unsichtbare Quader, die der Rumpfform folgen ----
export interface HullBox {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
}

export function hullCollisionBoxes(gaps: Gap[]): HullBox[] {
  const boxes: HullBox[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const z0 = stationZ(i);
    const z1 = stationZ(i + 1);
    const e0 = deckEdge(z0);
    const e1 = deckEdge(z1);
    const w = Math.max(e0.x, e1.x);
    const za = Math.min(e0.z, e1.z);
    const zb = Math.max(e0.z, e1.z);
    // Rumpfscheibe: Oberseite ist das begehbare Deck
    boxes.push({
      cx: 0,
      cy: (KEEL_Y + DECK_Y) / 2,
      cz: (za + zb) / 2,
      sx: w * 2,
      sy: DECK_Y - KEEL_Y,
      sz: Math.max(0.05, zb - za),
    });
    // Schanzkleid als schmale Wände
    for (const side of [-1, 1] as const) {
      if (inGap(side, z0, gaps) || inGap(side, z1, gaps)) continue;
      const h = (bulwarkHeight(z0) + bulwarkHeight(z1)) / 2;
      boxes.push({
        cx: side * ((e0.x + e1.x) / 2 - 0.08),
        cy: DECK_Y + h / 2,
        cz: (za + zb) / 2,
        sx: 0.24,
        sy: h,
        sz: Math.max(0.05, zb - za),
      });
    }
  }
  return boxes;
}
