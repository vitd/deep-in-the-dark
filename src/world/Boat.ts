import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { STR } from '../ui/strings.de';
import { BOAT_LAYOUT, DECK_Y, ROOF_Y } from './boatLayout';
import { addBox, buildRoom, RoomBuildContext } from './Room';
import { buildLadderMesh, LadderDef } from './Ladder';
import { texturedMat } from '../rendering/Textures';
import {
  buildBulwarkMesh,
  buildDeckMesh,
  buildHullMesh,
  Gap,
  halfWidth,
  hullCollisionBoxes,
} from './Hull';

// Prozedurales Boot: Rumpf, Deck, Reling, Aufbau mit 7 Räumen (aus
// boatLayout.ts), zwei Leitern und Motorraum-Props.
// Die Leitern liefern nur ihre Definition – gegriffen werden sie
// automatisch vom PlayerController (siehe Ladder.ts).

const hullMat = texturedMat('boat-wall.png', 3, 5, 0xffffff, 2.3);
const deckMat = texturedMat('plank.png', 4, 12);
const roofMat = new THREE.MeshLambertMaterial({ color: 0xb0a890 });
const railMat = new THREE.MeshLambertMaterial({ color: 0x7a5c40 });
const engineMat = new THREE.MeshLambertMaterial({ color: 0x7a2a20 });
const metalMat = new THREE.MeshLambertMaterial({ color: 0x4a545c });
const radioMat = new THREE.MeshLambertMaterial({ color: 0x3a4a40 });
const woodMat = texturedMat('plank.png', 1, 1);

export interface BoatResult {
  group: THREE.Group;
  ladders: LadderDef[];
}

export function buildBoat(
  scene: THREE.Scene,
  collision: CollisionWorld,
  interaction: InteractionSystem,
): BoatResult {
  const origin = new THREE.Vector3(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y, CONFIG.world.boatPos.z);
  const group = new THREE.Group();
  const ctx: RoomBuildContext = { origin, group, collision, interaction };

  // ---- Rumpf, Deck und Schanzkleid ----
  // Geformter Rumpf aus Spanten (siehe Hull.ts) statt eines Quaders.
  // Lücke im Schanzkleid für die Bordleiter (Backbord, Richtung Klippen);
  // das Heck bleibt offen, damit man ins Wasser springen kann.
  const gaps: Gap[] = [{ side: -1, z0: 9.3, z1: 10.7 }];

  const hull = buildHullMesh(hullMat);
  const deck = buildDeckMesh(deckMat);
  const bulwark = buildBulwarkMesh(railMat, gaps);
  for (const mesh of [hull, deck, bulwark]) {
    mesh.position.copy(origin);
    group.add(mesh);
  }

  // Kollision folgt der Rumpfform (unsichtbare Quader)
  for (const b of hullCollisionBoxes(gaps)) {
    collision.addBox(
      new THREE.Box3(
        new THREE.Vector3(
          origin.x + b.cx - b.sx / 2,
          origin.y + b.cy - b.sy / 2,
          origin.z + b.cz - b.sz / 2,
        ),
        new THREE.Vector3(
          origin.x + b.cx + b.sx / 2,
          origin.y + b.cy + b.sy / 2,
          origin.z + b.cz + b.sz / 2,
        ),
      ),
    );
  }

  // ---- Räume aus dem Layout ----
  for (const def of BOAT_LAYOUT) {
    buildRoom(ctx, def);
  }

  // Dachplatte über dem gesamten Aufbau (= Decke Hauptdeck-Räume,
  // Boden des Oberdecks).
  addBox(ctx, 0, 4.075, -1.5, 5.9, 0.15, 19.3, roofMat);
  // Decken der Oberdeck-Räume
  addBox(ctx, 0, 6.525, -9, 5.9, 0.15, 4.3, roofMat); // Brücke
  addBox(ctx, 1.225, 6.525, -5.75, 3.45, 0.15, 2.8, roofMat); // Kartenraum

  // ---- Runde Aufbauten (brechen die kantige Silhouette) ----
  const cyl = (
    rTop: number,
    rBot: number,
    h: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    tiltX = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10), mat);
    mesh.position.set(origin.x + x, origin.y + y, origin.z + z);
    mesh.rotation.x = tiltX;
    group.add(mesh);
    return mesh;
  };

  // Schornstein auf dem Achterteil des Dachs, leicht nach achtern geneigt
  cyl(0.42, 0.5, 1.9, 0.9, 5.05, 4.2, metalMat, 0.09);
  cyl(0.5, 0.5, 0.18, 0.9, 6.03, 4.28, engineMat, 0.09);
  // Mast auf dem Vordeck mit Rah
  cyl(0.07, 0.13, 7.2, 0, DECK_Y + 3.6, -13.2, woodMat);
  addBox(ctx, 0, DECK_Y + 5.6, -13.2, 3.4, 0.09, 0.09, woodMat, false);
  // Abgerundete Eckpfosten am Deckshaus
  for (const sx of [-1, 1]) {
    for (const cz of [-11.1, 8.1]) {
      cyl(0.17, 0.19, 2.6, sx * 2.9, DECK_Y + 1.25, cz, railMat);
    }
  }
  // Poller am Heck
  for (const sx of [-1, 1]) {
    cyl(0.13, 0.15, 0.5, sx * 2.6, DECK_Y + 0.25, 11.4, metalMat);
  }

  // ---- Leitern ----
  const ladders: LadderDef[] = [];

  // Bordleiter: vom Wasser aufs Deck (Backbord, z = 10 – der Klippen-
  // und Spawnseite zugewandt, damit der Spieler sie beim Anschwimmen sieht)
  // Der Standpunkt liegt außerhalb des Rumpfs, die Leiter also in +x.
  // x folgt der gekrümmten Bordwand an dieser Längsposition.
  const ladderZ = 10;
  const ladderHullX = halfWidth(ladderZ);
  buildLadderMesh(ctx, -ladderHullX - 0.1, ladderZ, -0.9, DECK_Y + 0.2, -1);
  const seaLadder: LadderDef = {
    standX: origin.x - ladderHullX - 0.55,
    standZ: origin.z + ladderZ,
    bottomY: origin.y - 1.35,
    topY: origin.y + DECK_Y,
    topExit: new THREE.Vector3(
      origin.x - ladderHullX + 0.8,
      origin.y + DECK_Y + 0.05,
      origin.z + ladderZ,
    ),
    bottomState: 'swim',
    face: { x: 1, z: 0 },
  };
  ladders.push(seaLadder);

  // Deckleiter: vom Hauptdeck aufs Oberdeck (Steuerbord-Aufbauwand, z = -2).
  // Man steht außen davor und blickt zur Wand, also in -x.
  buildLadderMesh(ctx, 3.0, -2, DECK_Y, ROOF_Y + 0.15);
  const deckLadder: LadderDef = {
    standX: origin.x + 3.45,
    standZ: origin.z - 2,
    bottomY: origin.y + DECK_Y,
    topY: origin.y + ROOF_Y,
    topExit: new THREE.Vector3(origin.x + 2.2, origin.y + ROOF_Y + 0.05, origin.z - 2),
    bottomState: 'walk',
    face: { x: -1, z: 0 },
  };
  ladders.push(deckLadder);

  // ---- Props ----
  // Kajüte: Koje + Spind
  addBox(ctx, -2.2, DECK_Y + 0.25, -9.8, 0.95, 0.5, 2.0, woodMat);
  addBox(ctx, -2.2, DECK_Y + 0.55, -9.8, 0.85, 0.15, 1.9, new THREE.MeshLambertMaterial({ color: 0xc0b090 }));
  addBox(ctx, -2.35, DECK_Y + 0.9, -7.6, 0.7, 1.8, 0.6, metalMat);

  // Kombüse: Arbeitszeile + Herd
  addBox(ctx, -2.3, DECK_Y + 0.45, -5, 0.9, 0.9, 3.2, woodMat);
  addBox(ctx, -2.3, DECK_Y + 0.975, -4.2, 0.85, 0.15, 0.9, metalMat);

  // Deck: Kisten (achtern der Bordleiter – der Ausstieg bei z = 10 muss
  // frei bleiben, sonst steht man beim Aufentern in der Kiste)
  addBox(ctx, -3.2, DECK_Y + 0.35, 8.8, 0.7, 0.7, 0.7, woodMat);
  addBox(ctx, -3.2, DECK_Y + 1.0, 8.9, 0.55, 0.55, 0.55, woodMat);
  addBox(ctx, 3.1, DECK_Y + 0.3, -11.2, 0.6, 0.6, 0.6, woodMat);

  // ---- Motorraum: Motor (defekt) + Funkgerät (ohne Strom) ----
  const engineGroup = new THREE.Group();
  const engineBlock = addBox(ctx, 0, DECK_Y + 0.6, 5.5, 1.5, 1.2, 2.4, engineMat);
  const engineTop = addBox(ctx, 0, DECK_Y + 1.35, 5.0, 0.9, 0.3, 1.0, metalMat, false);
  const pipe1 = addBox(ctx, 0.5, DECK_Y + 1.7, 6.2, 0.15, 1.0, 0.15, metalMat, false);
  const pipe2 = addBox(ctx, -0.5, DECK_Y + 1.5, 6.4, 0.15, 0.6, 0.15, metalMat, false);
  engineGroup.add(engineBlock, engineTop, pipe1, pipe2);
  interaction.add({ object: engineGroup, prompt: STR.engineBroken });
  group.add(engineGroup);

  const radioGroup = new THREE.Group();
  const radioBody = addBox(ctx, 2.45, DECK_Y + 1.4, 3.6, 0.5, 0.35, 0.7, radioMat, false);
  const antenna = addBox(ctx, 2.55, DECK_Y + 1.95, 3.4, 0.05, 0.75, 0.05, metalMat, false);
  const radioShelf = addBox(ctx, 2.5, DECK_Y + 1.18, 3.6, 0.55, 0.08, 0.8, woodMat, false);
  radioGroup.add(radioBody, antenna, radioShelf);
  interaction.add({ object: radioGroup, prompt: STR.radioDead });
  group.add(radioGroup);

  // Werkbank im Motorraum
  addBox(ctx, -2.3, DECK_Y + 0.45, 6.5, 0.9, 0.9, 2.0, woodMat);

  scene.add(group);
  return { group, ladders };
}
