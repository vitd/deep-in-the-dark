import { CONFIG } from '../config';

// Geometrie des kreisrunden Sees: Tiefenprofil und Begrenzung.
//
// Der See ist eine Kreisscheibe (world.lake) mit Steilküste ringsum.
// Die äußeren `shelfWidth` Meter sind ein ebener Küstenschelf, so tief
// wie bisher (seabedY); zur Seemitte fällt der Boden parabelförmig bis
// auf `centerDepth` ab.

const L = CONFIG.world.lake;

// Boden-Höhe (y) an einer Weltposition
export function lakeFloorY(x: number, z: number): number {
  const r = Math.hypot(x - L.center.x, z - L.center.z);
  const bowlR = L.radius - L.shelfWidth;
  if (r >= bowlR) return CONFIG.world.seabedY;
  const t = r / bowlR; // 0 = Seemitte .. 1 = Schelfkante
  const coastY = CONFIG.world.seabedY;
  const centerY = -L.centerDepth;
  return coastY + (centerY - coastY) * (1 - t * t);
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
