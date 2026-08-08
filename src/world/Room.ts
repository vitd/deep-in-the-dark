import * as THREE from 'three';
import { CollisionWorld } from '../systems/Collision';
import { Interactable, InteractionSystem } from '../systems/Interaction';
import { STR } from '../ui/strings.de';
import { RoomDef, WallSide } from './boatLayout';
import { texturedMat } from '../rendering/Textures';

// Baut einen Raum aus Box-Primitiven. Die Türwand besteht aus drei Boxen
// um eine echte begehbare Öffnung – kein CSG nötig. Jede Box registriert
// sich zugleich als Kollisions-AABB, Geometrie und Kollision können also
// nicht auseinanderlaufen.

const WALL_T = 0.15;
const DOOR_W = 1.0;
const DOOR_H = 2.0;

const wallMat = texturedMat('boat-wall.png', 2, 1, 0xffffff, 2.4);
const doorMat = texturedMat('door.png', 1, 1, 0xffffff, 1.2);

// Referenzen einer versperrten Tür – zum späteren Freischalten
// (Mesh entfernen, Kollisionsbox lösen, "Versperrt"-Prompt abmelden).
export interface DoorRef {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  entry: Interactable;
}

export interface RoomBuildContext {
  origin: THREE.Vector3; // Weltposition des Boots
  group: THREE.Group;
  collision: CollisionWorld;
  interaction: InteractionSystem;
  doors: Map<string, DoorRef>;
}

function addBox(
  ctx: RoomBuildContext,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  mat: THREE.Material,
  collide = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(ctx.origin.x + cx, ctx.origin.y + cy, ctx.origin.z + cz);
  ctx.group.add(mesh);
  if (collide) {
    // Alles am Boot ist eine Frame-Box: fährt das Boot, wird die
    // Kollision im Boots-Rahmen aufgelöst (siehe CollisionWorld).
    ctx.collision.addFrameBox(
      new THREE.Box3(
        new THREE.Vector3(mesh.position.x - sx / 2, mesh.position.y - sy / 2, mesh.position.z - sz / 2),
        new THREE.Vector3(mesh.position.x + sx / 2, mesh.position.y + sy / 2, mesh.position.z + sz / 2),
      ),
    );
  }
  return mesh;
}

// Pixeliges Namensschild über der Tür (CanvasTexture, nearest-gefiltert).
function makeLabel(text: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#2a2018';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#e8d8a0';
  g.font = 'bold 14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 64, 17);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.3),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  return mesh;
}

export function buildRoom(ctx: RoomBuildContext, def: RoomDef): void {
  const [ix0, iy0, iz0] = def.min;
  const [ix1, iy1, iz1] = def.max;
  const h = iy1 - iy0;
  const cy = iy0 + h / 2;

  const walls: WallSide[] = ['port', 'starboard', 'fore', 'aft'];
  for (const wall of walls) {
    const hasDoor = def.door.wall === wall;
    const win = !hasDoor && def.window?.wall === wall ? def.window : null;
    if (wall === 'port' || wall === 'starboard') {
      const wx = wall === 'port' ? ix0 - WALL_T / 2 : ix1 + WALL_T / 2;
      const len = iz1 - iz0 + 2 * WALL_T;
      const cz = (iz0 + iz1) / 2;
      if (hasDoor) {
        buildDoorWall(ctx, def, 'z', wx, cz, len, iy0, iy1);
      } else if (win) {
        // Wand mit offenem Fensterschlitz: Brüstung unten, Sturz oben
        addBox(ctx, wx, (iy0 + win.y0) / 2, cz, WALL_T, win.y0 - iy0, len, wallMat);
        addBox(ctx, wx, (win.y1 + iy1) / 2, cz, WALL_T, iy1 - win.y1, len, wallMat);
      } else {
        addBox(ctx, wx, cy, cz, WALL_T, h, len, wallMat);
      }
    } else {
      const wz = wall === 'fore' ? iz0 - WALL_T / 2 : iz1 + WALL_T / 2;
      const len = ix1 - ix0 + 2 * WALL_T;
      const cx = (ix0 + ix1) / 2;
      if (hasDoor) {
        buildDoorWall(ctx, def, 'x', wz, cx, len, iy0, iy1);
      } else if (win) {
        addBox(ctx, cx, (iy0 + win.y0) / 2, wz, len, win.y0 - iy0, WALL_T, wallMat);
        addBox(ctx, cx, (win.y1 + iy1) / 2, wz, len, iy1 - win.y1, WALL_T, wallMat);
      } else {
        addBox(ctx, cx, cy, wz, len, h, WALL_T, wallMat);
      }
    }
  }
}

// Türwand: zwei Seitensegmente + Sturz über der Öffnung.
// axis 'z': Wand liegt auf konstantem x, erstreckt sich entlang z (und umgekehrt).
function buildDoorWall(
  ctx: RoomBuildContext,
  def: RoomDef,
  axis: 'x' | 'z',
  wallCoord: number,
  center: number,
  len: number,
  floorY: number,
  ceilY: number,
): void {
  const doorCenter = center + (def.door.offset ?? 0);
  const h = ceilY - floorY;
  const a0 = center - len / 2;
  const a1 = center + len / 2;
  const d0 = doorCenter - DOOR_W / 2;
  const d1 = doorCenter + DOOR_W / 2;

  const seg = (from: number, to: number, cy: number, sh: number) => {
    if (to - from < 0.01) return;
    const c = (from + to) / 2;
    const s = to - from;
    if (axis === 'z') {
      addBox(ctx, wallCoord, cy, c, WALL_T, sh, s, wallMat);
    } else {
      addBox(ctx, c, cy, wallCoord, s, sh, WALL_T, wallMat);
    }
  };

  seg(a0, d0, floorY + h / 2, h); // Segment vor der Tür
  seg(d1, a1, floorY + h / 2, h); // Segment nach der Tür
  // Sturz über der Türöffnung
  const lintelH = h - DOOR_H;
  if (lintelH > 0.01) {
    seg(d0, d1, floorY + DOOR_H + lintelH / 2, lintelH);
  }

  // Versperrte Räume bekommen eine geschlossene Tür in der Öffnung.
  // Mesh, Kollisionsbox und Prompt werden registriert, damit die Tür
  // später freigeschaltet werden kann (z. B. Brücke bei laufendem Motor).
  if (def.locked) {
    const doorMesh =
      axis === 'z'
        ? addBox(ctx, wallCoord, floorY + DOOR_H / 2, doorCenter, WALL_T, DOOR_H, DOOR_W, doorMat, false)
        : addBox(ctx, doorCenter, floorY + DOOR_H / 2, wallCoord, DOOR_W, DOOR_H, WALL_T, doorMat, false);
    const half = new THREE.Vector3(
      (axis === 'z' ? WALL_T : DOOR_W) / 2,
      DOOR_H / 2,
      (axis === 'z' ? DOOR_W : WALL_T) / 2,
    );
    const doorBox = new THREE.Box3(
      doorMesh.position.clone().sub(half),
      doorMesh.position.clone().add(half),
    );
    ctx.collision.addFrameBox(doorBox);
    const interactable: Interactable = { object: doorMesh, prompt: STR.locked };
    ctx.interaction.add(interactable);
    ctx.doors.set(def.id, { mesh: doorMesh, box: doorBox, entry: interactable });
  }

  // Namensschild über der Tür (außen).
  const label = makeLabel(def.name);
  if (axis === 'z') {
    label.position.set(
      ctx.origin.x + wallCoord + (wallCoord > (def.min[0] + def.max[0]) / 2 ? WALL_T : -WALL_T),
      ctx.origin.y + floorY + DOOR_H + 0.25,
      ctx.origin.z + doorCenter,
    );
    label.rotation.y = wallCoord > (def.min[0] + def.max[0]) / 2 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    label.position.set(
      ctx.origin.x + doorCenter,
      ctx.origin.y + floorY + DOOR_H + 0.25,
      ctx.origin.z + wallCoord + (wallCoord > (def.min[2] + def.max[2]) / 2 ? WALL_T : -WALL_T),
    );
    label.rotation.y = wallCoord > (def.min[2] + def.max[2]) / 2 ? 0 : Math.PI;
  }
  ctx.group.add(label);
}

export { addBox };
