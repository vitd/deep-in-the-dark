import * as THREE from 'three';
import { RoomBuildContext } from './Room';

// Leiter-Mechanik: Der Spieler wird beim Klettern auf standPos (x/z)
// fixiert und bewegt sich mit W/S zwischen bottomY und topY. Oben wird
// er auf topExit gesetzt.

export interface LadderDef {
  standX: number; // Weltkoordinaten der Kletterposition
  standZ: number;
  bottomY: number;
  topY: number;
  topExit: THREE.Vector3;
  bottomState: 'swim' | 'walk';
}

const railMat = new THREE.MeshLambertMaterial({ color: 0x6a5138 });

// Baut die Leiter-Optik (Holme + Sprossen) an einer x-parallelen Wand.
// `side` gibt an, in welche x-Richtung die Sprossen zeigen (+1/-1).
// Nicht kollidierend, damit sie die Kletterposition nicht blockiert.
export function buildLadderMesh(
  ctx: RoomBuildContext,
  x: number,
  z: number,
  y0: number,
  y1: number,
  side = 1,
): THREE.Group {
  const g = new THREE.Group();
  const height = y1 - y0;
  const railGeo = new THREE.BoxGeometry(0.08, height, 0.08);
  for (const dz of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(ctx.origin.x + x, ctx.origin.y + y0 + height / 2, ctx.origin.z + z + dz);
    g.add(rail);
  }
  const rungGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
  const steps = Math.floor(height / 0.32);
  for (let i = 1; i <= steps; i++) {
    const rung = new THREE.Mesh(rungGeo, railMat);
    rung.position.set(ctx.origin.x + x + 0.06 * side, ctx.origin.y + y0 + i * 0.32, ctx.origin.z + z);
    g.add(rung);
  }
  ctx.group.add(g);
  return g;
}
