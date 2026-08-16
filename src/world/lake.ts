import { CONFIG } from '../config';

// Geometrie des kreisrunden Sees: Tiefenprofil und Begrenzung.
//
// Der See ist eine Kreisscheibe (world.lake) mit Steilküste ringsum.
// Die äußeren `shelfWidth` Meter sind ein ebener Küstenschelf, so tief
// wie bisher (seabedY); zur Seemitte fällt der Boden parabelförmig bis
// auf `centerDepth` ab. Über dieses Basisprofil legt sich ein Relief
// aus Rücken, Kuppen und feiner Unruhe (`seabedRelief`), damit der
// Grund nicht überall gleich aussieht.

const L = CONFIG.world.lake;

// Mindestwassertiefe über dem Seeboden. Das Boot kollidiert nicht mit
// der Welt (die Begrenzung macht clampToLake), deshalb darf kein Fels
// und keine Kuppe bis dicht unter die Oberfläche reichen – sonst führe
// man sichtbar durch Gestein hindurch.
export const SEABED_MIN_DEPTH = 6;

// ---- Deterministisches Value-Noise ----
// Bewusst ohne Math.random(): Relief, Streufelsen und Kollisionsboxen
// werden aus denselben Funktionen abgeleitet und müssen bei jedem
// Spielstart identisch herauskommen.

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Value-Noise auf dem Einheitsgitter mit Smoothstep-Interpolation,
// Ergebnis in [0,1]. Die Aufrufer skalieren die Koordinaten selbst.
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const sx = (x - ix) * (x - ix) * (3 - 2 * (x - ix));
  const sz = (z - iz) * (z - iz) * (3 - 2 * (z - iz));
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sz;
}

// Aufschüttung über dem Basisprofil, Ergebnis in [0..~1.6]. Immer >= 0:
// der Boden wird nur angehoben, nie tiefer gelegt. Dadurch bleiben alle
// bekannten Tiefen gültig und die flache Kollisionsplatte am Schelf
// liegt weiterhin unter dem Sand.
export function seabedRelief(x: number, z: number): number {
  // Großflächige "Felsigkeit": sandige Ebenen wechseln sich mit
  // schroffen Zonen ab – das ist die Hauptquelle der Abwechslung
  const rough = noise2(x / 260 + 31.7, z / 260 - 12.3);
  // Ridged Noise: ergibt scharfe Rücken statt runder Kuppen
  const rn = noise2(x / 120 - 3.4, z / 120 + 6.9);
  const ridge = 1 - Math.abs(rn * 2 - 1);
  const hills = noise2(x / 50 - 5.1, z / 50 + 8.4);
  // Feinste Oktave bewusst nicht viel kürzer als die Kantenlänge des
  // Bodengitters (~6 m, siehe Cliffs.ts), sonst flimmert das Relief
  const fine = noise2(x / 18 + 2.2, z / 18 - 4.8);
  const shape = ridge * ridge * 0.6 + hills * 0.32 + fine * 0.09;
  return shape * (0.3 + rough * 1.3);
}

// Boden-Höhe (y) an einer Weltposition
export function lakeFloorY(x: number, z: number): number {
  const r = Math.hypot(x - L.center.x, z - L.center.z);
  const bowlR = L.radius - L.shelfWidth;
  const coastY = CONFIG.world.seabedY;
  let base = coastY;
  if (r < bowlR) {
    const t = r / bowlR; // 0 = Seemitte .. 1 = Schelfkante
    base = coastY + (-L.centerDepth - coastY) * (1 - t * t);
  }
  // Die Reliefhöhe wächst mit der Wassertiefe: am flachen Küstenschelf
  // bleiben es knietiefe Wellen im Sand, in der tiefen Mitte werden
  // daraus richtige Berge.
  const amp = Math.min(34, Math.max(1.2, (CONFIG.world.seaLevel - base - 4) * 0.55));
  const y = base + seabedRelief(x, z) * amp;
  return Math.min(y, CONFIG.world.seaLevel - SEABED_MIN_DEPTH);
}

// Hält einen Punkt horizontal im See; `margin` = Mindestabstand zur
// Steilküste. Liefert true, wenn geklemmt wurde.
export function clampToLake(pos: { x: number; z: number }, margin: number): boolean {
  const dx = pos.x - L.center.x;
  const dz = pos.z - L.center.z;
  const max = L.radius - margin;
  const d2 = dx * dx + dz * dz;
  if (d2 <= max * max) return false;
  const d = Math.sqrt(d2);
  pos.x = L.center.x + (dx / d) * max;
  pos.z = L.center.z + (dz / d) * max;
  return true;
}

// Liegt der Punkt mit `margin` Abstand zur Steilküste noch im See?
export function insideLake(x: number, z: number, margin: number): boolean {
  const dx = x - L.center.x;
  const dz = z - L.center.z;
  const max = L.radius - margin;
  return dx * dx + dz * dz <= max * max;
}
