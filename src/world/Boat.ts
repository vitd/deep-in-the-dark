import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { STR } from '../ui/strings.de';
import { BOAT_LAYOUT, DECK_Y, ROOF_Y } from './boatLayout';
import { addBox, buildRoom, RoomBuildContext } from './Room';
import { buildLadderMesh, LadderDef } from './Ladder';
import { texturedMat } from '../rendering/Textures';

// Prozedurales Boot: Rumpf, Deck, Reling, Aufbau mit 7 Räumen (aus
// boatLayout.ts), zwei Leitern und Motorraum-Props.

const hullMat = texturedMat('boat-wall.png', 8, 2, 0xffffff, 1.8);
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
  onClimb: (ladder: LadderDef) => void,
): BoatResult {
  const origin = new THREE.Vector3(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y, CONFIG.world.boatPos.z);
  const group = new THREE.Group();
  const ctx: RoomBuildContext = { origin, group, collision, interaction };

  // ---- Rumpf & Deck ----
  // Rumpfkörper (x -4..4, z -12..12, y -1..1.5); Oberseite = Deck.
  addBox(ctx, 0, 0.25, 0, 8, 2.5, 24, hullMat);
  const deck = addBox(ctx, 0, 1.53, 0, 8, 0.06, 24, deckMat, false);
  deck.position.y += 0.0; // rein optische Deckplatte auf dem Rumpf

  // Bug: dekorative Keile + einfacher Kollisionsblock
  const bowCol = addBox(ctx, 0, 0.25, -13.2, 5, 2.5, 2.4, hullMat);
  bowCol.visible = true;
  const wedgeGeo = new THREE.BoxGeometry(4.6, 2.5, 3.2);
  for (const side of [-1, 1]) {
    const wedge = new THREE.Mesh(wedgeGeo, hullMat);
    wedge.position.set(origin.x + side * 1.4, origin.y + 0.25, origin.z - 14.2);
    wedge.rotation.y = side * 0.55;
    group.add(wedge);
  }

  // ---- Reling (mit Lücke an der Bordleiter, Heck offen) ----
  const railH = 0.9;
  const railY = DECK_Y + railH / 2;
  // Backbord: Lücke bei z 9.4..10.6 (Bordleiter, zeigt Richtung Klippen/Spawn)
  addBox(ctx, -3.96, railY, -1.3, 0.08, railH, 21.4, railMat); // z -12..9.4
  addBox(ctx, -3.96, railY, 11.3, 0.08, railH, 1.4, railMat); // z 10.6..12
  // Steuerbord durchgehend
  addBox(ctx, 3.96, railY, 0, 0.08, railH, 24, railMat);
  // Bug-Reling
  addBox(ctx, 0, railY, -11.96, 8, railH, 0.08, railMat);

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

  // ---- Leitern ----
  const ladders: LadderDef[] = [];

  // Bordleiter: vom Wasser aufs Deck (Backbord, z = 10 – der Klippen-
  // und Spawnseite zugewandt, damit der Spieler sie beim Anschwimmen sieht)
  buildLadderMesh(ctx, -4.1, 10, -0.9, DECK_Y + 0.2, -1);
  const seaLadder: LadderDef = {
    standX: origin.x - 4.55,
    standZ: origin.z + 10,
    bottomY: origin.y - 1.35,
    topY: origin.y + DECK_Y,
    topExit: new THREE.Vector3(origin.x - 3.3, origin.y + DECK_Y + 0.05, origin.z + 10),
    bottomState: 'swim',
  };
  ladders.push(seaLadder);
  const seaLadderHitbox = addBox(ctx, -4.15, 0.5, 10, 0.5, 3.4, 0.9, railMat, false);
  seaLadderHitbox.visible = false;
  interaction.add({
    object: seaLadderHitbox,
    prompt: STR.climb,
    interact: () => onClimb(seaLadder),
    maxDistance: 4,
  });

  // Deckleiter: vom Hauptdeck aufs Oberdeck (Steuerbord-Aufbauwand, z = -2)
  buildLadderMesh(ctx, 3.0, -2, DECK_Y, ROOF_Y + 0.15);
  const deckLadder: LadderDef = {
    standX: origin.x + 3.45,
    standZ: origin.z - 2,
    bottomY: origin.y + DECK_Y,
    topY: origin.y + ROOF_Y,
    topExit: new THREE.Vector3(origin.x + 2.2, origin.y + ROOF_Y + 0.05, origin.z - 2),
    bottomState: 'walk',
  };
  ladders.push(deckLadder);
  const deckLadderHitbox = addBox(ctx, 3.05, 2.9, -2, 0.4, 2.8, 0.8, railMat, false);
  deckLadderHitbox.visible = false;
  interaction.add({
    object: deckLadderHitbox,
    prompt: STR.climb,
    interact: () => onClimb(deckLadder),
    maxDistance: 3.5,
  });

  // ---- Props ----
  // Kajüte: Koje + Spind
  addBox(ctx, -2.2, DECK_Y + 0.25, -9.8, 0.95, 0.5, 2.0, woodMat);
  addBox(ctx, -2.2, DECK_Y + 0.55, -9.8, 0.85, 0.15, 1.9, new THREE.MeshLambertMaterial({ color: 0xc0b090 }));
  addBox(ctx, -2.35, DECK_Y + 0.9, -7.6, 0.7, 1.8, 0.6, metalMat);

  // Kombüse: Arbeitszeile + Herd
  addBox(ctx, -2.3, DECK_Y + 0.45, -5, 0.9, 0.9, 3.2, woodMat);
  addBox(ctx, -2.3, DECK_Y + 0.975, -4.2, 0.85, 0.15, 0.9, metalMat);

  // Deck: Kisten
  addBox(ctx, -3.2, DECK_Y + 0.35, 9.5, 0.7, 0.7, 0.7, woodMat);
  addBox(ctx, -3.2, DECK_Y + 1.0, 9.6, 0.55, 0.55, 0.55, woodMat);
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
