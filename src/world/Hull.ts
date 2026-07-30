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
  { z: -15.6, w: 1.05 },
  { z: -14.2, w: 2.15 },
  { z: -12.6, w: 2.9 },
  { z: -11.2, w: 3.5 },
  { z: -9.0, w: 3.78 },
  { z: -6.0, w: 3.92 },
  { z: -1.0, w: 4.00 },
  { z: 4.0, w: 3.94 },
  { z: 8.0, w: 3.76 },
  { z: 11.0, w: 3.58 },
  { z: 12.5, w: 3.5 }, // breites Heck: Spiegelheck statt Spitze
];

// Decksprung (Sheer): Zum Bug steigt die Decklinie deutlich an – das
// typische Fischerboot-Profil. Im Bereich des Deckshauses (z >= -9.5)
// bleibt das Deck eben, damit die Räume unverändert funktionieren.
export function sheer(z: number): number {
  if (z >= -9.5) return 0;
  const f = Math.min(1, (-9.5 - z) / (-9.5 - BOW_Z));
  return f * f * 0.95;
}

export function deckHeight(z: number): number {
  return DECK_Y + sheer(z);
}

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
export function deckEdge(z: number): { x: number; y: number; z: number } {
  const y = deckHeight(z);
  return { x: halfWidth(z) * SECTION[0].f, y, z: z + rake(z, y) };
}

function ringAt(z: number): THREE.Vector3[] {
  const w = halfWidth(z);
  const top = deckHeight(z);
  const pts: THREE.Vector3[] = [];
  const yOf = (i: number) => (i === 0 ? top : SECTION[i].y);
  for (let i = 0; i < SECTION.length; i++) {
    pts.push(new THREE.Vector3(-SECTION[i].f * w, yOf(i), z + rake(z, yOf(i))));
  }
  for (let i = SECTION.length - 2; i >= 0; i--) {
    pts.push(new THREE.Vector3(SECTION[i].f * w, yOf(i), z + rake(z, yOf(i))));
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
    // WICHTIG: einmal ganz herum (mit Wrap-Around) – sonst bleibt oben
    // zwischen den beiden Deckskanten ein offener Schlitz im Spiegel
    for (let j = 0; j < RING; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % RING];
      push(c, 0.5, 0.5);
      push(flip ? a : b, 0, 1);
      push(flip ? b : a, 1, 1);
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
      new THREE.Vector3(-e0.x, e0.y, e0.z),
      new THREE.Vector3(e0.x, e0.y, e0.z),
      new THREE.Vector3(e1.x, e1.y, e1.z),
      new THREE.Vector3(-e1.x, e1.y, e1.z),
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

// Höhe des Schanzkleids: durch den Decksprung liefert der Rumpf vorn
// schon Höhe, das Schanzkleid selbst bleibt fast konstant und wird
// achtern (Arbeitsdeck) niedriger.
export function bulwarkHeight(z: number): number {
  if (z < -11) return 0.95 + Math.min(1, (-11 - z) / 5.5) * 0.15;
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
      // Oberkante leicht nach innen geneigt; Basis folgt dem Decksprung
      const a = new THREE.Vector3(side * e0.x, e0.y, e0.z);
      const b = new THREE.Vector3(side * e0.x * 0.94, e0.y + h0, e0.z);
      const c = new THREE.Vector3(side * e1.x * 0.94, e1.y + h1, e1.z);
      const d = new THREE.Vector3(side * e1.x, e1.y, e1.z);
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
    // Rumpfscheibe: Oberseite ist das begehbare Deck (folgt dem Sprung –
    // der Spieler steigt die flachen Stufen über die Step-Up-Logik hoch)
    const top = Math.min(e0.y, e1.y);
    boxes.push({
      cx: 0,
      cy: (KEEL_Y + top) / 2,
      cz: (za + zb) / 2,
      sx: w * 2,
      sy: top - KEEL_Y,
      sz: Math.max(0.05, zb - za),
    });
    // Schanzkleid als schmale Wände
    for (const side of [-1, 1] as const) {
      if (inGap(side, z0, gaps) || inGap(side, z1, gaps)) continue;
      const h = (bulwarkHeight(z0) + bulwarkHeight(z1)) / 2;
      // schlank halten, damit der Gang neben dem Deckshaus passierbar bleibt
      boxes.push({
        cx: side * ((e0.x + e1.x) / 2 - 0.04),
        cy: top + h / 2,
        cz: (za + zb) / 2,
        sx: 0.16,
        sy: h,
        sz: Math.max(0.05, zb - za),
      });
    }
  }
  return boxes;
}

// ---- Weißer Scheuerleisten-Streifen entlang der Deckskante ----
// Das klassische Fischerboot-Merkmal: ein heller Streifen, der der
// geschwungenen Decklinie folgt und sie sichtbar macht.
export function buildStrakeMesh(material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < SEGMENTS; i++) {
      const e0 = deckEdge(stationZ(i));
      const e1 = deckEdge(stationZ(i + 1));
      const a = new THREE.Vector3(side * e0.x * 1.012, e0.y - 0.02, e0.z);
      const b = new THREE.Vector3(side * e0.x * 1.012, e0.y - 0.28, e0.z);
      const c = new THREE.Vector3(side * e1.x * 1.012, e1.y - 0.28, e1.z);
      const d = new THREE.Vector3(side * e1.x * 1.012, e1.y - 0.02, e1.z);
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p.x, p.y, p.z);
        uv.push(p.z / 4, p.y);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
