import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem, Interactable } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { BOAT_LAYOUT, DECK_Y, ROOF_Y } from './boatLayout';
import { addBox, buildRoom, DoorRef, RoomBuildContext } from './Room';
import { buildLadderMesh, LadderDef } from './Ladder';
import { loadModel } from '../rendering/Models';
import { texturedMat } from '../rendering/Textures';
import {
  buildBulwarkMesh,
  buildDeckMesh,
  buildHullMesh,
  buildStrakeMesh,
  deckHeight,
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
const phoneMat = new THREE.MeshLambertMaterial({ color: 0x3a4a40 });
const woodMat = texturedMat('plank.png', 1, 1);

export interface BoatResult {
  // Dreh-/Fahr-Pivot (Weltposition = Bootszentrum). Wird vom
  // BoatController bewegt; `group` hängt darunter und enthält alle
  // Boot-Teile in Originalkoordinaten.
  pivot: THREE.Group;
  group: THREE.Group;
  ladders: LadderDef[];
  motor: MotorRef;
  helm: HelmRef;
  // Entfernt die Tür eines versperrten Raums (Mesh, Kollision, Prompt).
  unlock: (roomId: string) => boolean;
}

export interface BoatHooks {
  // Wird gerufen, wenn der Spieler die Werkbank (Tisch in der Kajüte) benutzt
  onCraftingTable: () => void;
  // Motor: dynamischer Prompt + Interaktion (Material anwenden)
  motorPrompt: () => string;
  onMotorInteract: () => void;
  // Steuerstand auf der Brücke
  helmPrompt: () => string;
  onHelmInteract: () => void;
}

export interface HelmRef {
  group: THREE.Group;
  // dreht sich mit dem Rad-Einschlag / kippt mit dem Fahrhebel
  wheelSpin: THREE.Object3D;
  leverArm: THREE.Object3D;
  // Standpunkt des Steuermanns (Originalkoordinaten, Fußhöhe)
  stand: THREE.Vector3;
}

export interface MotorRef {
  group: THREE.Group;
  light: THREE.PointLight;
  setRunning: () => void;
}

export function buildBoat(
  scene: THREE.Scene,
  collision: CollisionWorld,
  interaction: InteractionSystem,
  inventory: Inventory,
  hooks: BoatHooks,
): BoatResult {
  const origin = new THREE.Vector3(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y, CONFIG.world.boatPos.z);
  const group = new THREE.Group();
  const doors = new Map<string, DoorRef>();
  const ctx: RoomBuildContext = { origin, group, collision, interaction, doors };

  // ---- Rumpf, Deck und Schanzkleid ----
  // Geformter Rumpf aus Spanten (siehe Hull.ts) statt eines Quaders.
  // Lücke im Schanzkleid für die Bordleiter (Backbord, Richtung Klippen);
  // das Heck bleibt offen, damit man ins Wasser springen kann.
  const gaps: Gap[] = [{ side: -1, z0: 9.3, z1: 10.7 }];

  // Rumpf, Deck und Schanzkleid sind dünne Schalen und von beiden Seiten
  // sichtbar (z. B. Schanzkleid-Innenseite vom Deck aus) – DoubleSide.
  const hullShellMat = hullMat.clone();
  hullShellMat.side = THREE.DoubleSide;
  const deckShellMat = deckMat.clone();
  deckShellMat.side = THREE.DoubleSide;
  const bulwarkMat = railMat.clone();
  bulwarkMat.side = THREE.DoubleSide;

  const hull = buildHullMesh(hullShellMat);
  const deck = buildDeckMesh(deckShellMat);
  const bulwark = buildBulwarkMesh(bulwarkMat, gaps);
  // Weißer Scheuerleisten-Streifen: macht die geschwungene Decklinie
  // sichtbar – typisches Fischerboot-Merkmal
  const strake = buildStrakeMesh(
    new THREE.MeshLambertMaterial({ color: 0xd8d4c4, side: THREE.DoubleSide }),
  );
  for (const mesh of [hull, deck, bulwark, strake]) {
    mesh.position.copy(origin);
    group.add(mesh);
  }

  // Kollision folgt der Rumpfform (unsichtbare Quader)
  for (const b of hullCollisionBoxes(gaps)) {
    collision.addFrameBox(
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
  addBox(ctx, 0, 4.075, -0.3, 5.4, 0.15, 19.3, roofMat);
  // Decken der Oberdeck-Räume
  addBox(ctx, 0, 6.525, -7.8, 5.4, 0.15, 4.3, roofMat); // Brücke
  addBox(ctx, 1.1, 6.525, -4.55, 3.2, 0.15, 2.8, roofMat); // Kartenraum

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

  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c4 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2c34 });
  const fenderMat = new THREE.MeshLambertMaterial({ color: 0xb06a34 });

  // Schornstein auf dem Achterteil des Dachs, leicht nach achtern geneigt
  cyl(0.42, 0.5, 1.9, 0.9, 5.05, 5.4, metalMat, 0.09);
  cyl(0.5, 0.5, 0.18, 0.9, 6.03, 5.48, engineMat, 0.09);

  // Mast auf dem ansteigenden Vordeck, mit Ausleger-Baum nach achtern
  // (Ladebaum) – die typische Fischerboot-Silhouette
  const mastZ = -12.6;
  const mastBase = deckHeight(mastZ);
  cyl(0.07, 0.13, 7.4, 0, mastBase + 3.7, mastZ, woodMat);
  addBox(ctx, 0, mastBase + 5.9, mastZ, 3.2, 0.09, 0.09, woodMat, false);
  // Der Baum hängt hoch genug, um über das Steuerhausdach zu schwenken –
  // er darf nicht durch die Frontscheibe in die Brücke ragen.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6.5, 8), woodMat);
  boom.position.set(origin.x, origin.y + mastBase + 5.1, origin.z + mastZ + 3.0);
  boom.rotation.x = Math.PI / 2 - 0.5; // schräg nach oben-achtern
  group.add(boom);
  // Tau vom Masttop zum Baumende (fast waagerecht)
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5.9, 6), glassMat);
  rope.position.set(origin.x, origin.y + mastBase + 6.75, origin.z + mastZ + 2.9);
  rope.rotation.x = Math.PI / 2 - 0.02;
  group.add(rope);

  // Heckgalgen (A-Rahmen) über dem Arbeitsdeck
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.1, 8), metalMat);
    leg.position.set(origin.x + sx * 2.1, origin.y + DECK_Y + 1.5, origin.z + 11.8);
    leg.rotation.z = -sx * 0.28;
    group.add(leg);
  }
  addBox(ctx, 0, DECK_Y + 2.95, 11.8, 3.6, 0.14, 0.14, metalMat, false);
  cyl(0.16, 0.16, 0.5, 0, DECK_Y + 2.7, 11.8, metalMat); // Umlenkrolle

  // Netzwinde: liegende Trommel auf dem Achterdeck
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.7, 10), woodMat);
  winch.position.set(origin.x, origin.y + DECK_Y + 0.55, origin.z + 10.5);
  winch.rotation.z = Math.PI / 2;
  group.add(winch);
  addBox(ctx, -0.95, DECK_Y + 0.35, 10.5, 0.18, 0.7, 0.5, metalMat);
  addBox(ctx, 0.95, DECK_Y + 0.35, 10.5, 0.18, 0.7, 0.5, metalMat);

  // Fender: hängen außen an der Bordwand (beidseitig, nicht an der Leiter)
  for (const { sx, z } of [
    { sx: -1, z: 2 }, { sx: -1, z: 5.5 }, { sx: -1, z: -3 },
    { sx: 1, z: 3 }, { sx: 1, z: 7 }, { sx: 1, z: -1.5 },
  ]) {
    const fx = halfWidth(z) + 0.16;
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), fenderMat);
    fender.position.set(origin.x + sx * fx, origin.y + DECK_Y - 0.45, origin.z + z);
    group.add(fender);
  }

  // Abgerundete Eckpfosten am Deckshaus
  for (const sx of [-1, 1]) {
    for (const cz of [-9.9, 9.3]) {
      cyl(0.17, 0.19, 2.6, sx * 2.65, DECK_Y + 1.25, cz, railMat);
    }
  }
  // Poller am Heck
  for (const sx of [-1, 1]) {
    cyl(0.13, 0.15, 0.5, sx * 2.6, DECK_Y + 0.25, 11.4, metalMat);
  }

  // ---- Steuerhaus-Look für die Brücke: Fensterband + Dachüberstand ----
  // Frontscheibe: durchsichtig, denn der Steuermann schaut hier hinaus
  // (die Brücken-Frontwand hat dahinter einen offenen Fensterschlitz)
  const windshieldMat = new THREE.MeshLambertMaterial({
    color: 0xbfe0ec,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  addBox(ctx, 0, 5.55, -9.92, 4.8, 0.75, 0.08, windshieldMat, false);
  addBox(ctx, -2.62, 5.55, -8.0, 0.08, 0.75, 3.2, glassMat, false);
  addBox(ctx, 2.62, 5.55, -8.0, 0.08, 0.75, 3.2, glassMat, false);
  // weiße Fensterrahmen-Bänder darüber/darunter
  addBox(ctx, 0, 6.05, -9.9, 5.0, 0.12, 0.1, whiteMat, false);
  addBox(ctx, 0, 5.05, -9.9, 5.0, 0.12, 0.1, whiteMat, false);
  // Dachüberstand über der Brücke
  addBox(ctx, 0, 6.66, -7.8, 5.9, 0.1, 4.9, whiteMat, false);
  // Antennen auf dem Steuerhausdach
  cyl(0.02, 0.03, 1.8, -1.6, 7.55, -7.0, metalMat);
  cyl(0.02, 0.03, 1.1, -1.1, 7.2, -6.4, metalMat);

  // Weißes Trimm-Band oben am Deckshaus (Hauptdeck-Aufbau)
  addBox(ctx, 0, 4.02, -9.93, 5.5, 0.14, 0.1, whiteMat, false);
  addBox(ctx, 0, 4.02, 9.33, 5.5, 0.14, 0.1, whiteMat, false);
  addBox(ctx, -2.73, 4.02, -0.3, 0.1, 0.14, 19.4, whiteMat, false);
  addBox(ctx, 2.73, 4.02, -0.3, 0.1, 0.14, 19.4, whiteMat, false);

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

  // Deckleiter: vom Hauptdeck aufs Oberdeck (Steuerbord-Aufbauwand, z = -0.8).
  // Man steht außen davor und blickt zur Wand, also in -x.
  buildLadderMesh(ctx, 2.75, -0.8, DECK_Y, ROOF_Y + 0.15);
  const deckLadder: LadderDef = {
    standX: origin.x + 3.15,
    standZ: origin.z - 0.8,
    bottomY: origin.y + DECK_Y,
    topY: origin.y + ROOF_Y,
    topExit: new THREE.Vector3(origin.x + 2.0, origin.y + ROOF_Y + 0.05, origin.z - 0.8),
    bottomState: 'walk',
    face: { x: -1, z: 0 },
  };
  ladders.push(deckLadder);

  // ---- Props ----
  // Kajüte: Koje + Spind
  addBox(ctx, -1.95, DECK_Y + 0.25, -8.6, 0.95, 0.5, 2.0, woodMat);
  addBox(ctx, -1.95, DECK_Y + 0.55, -8.6, 0.85, 0.15, 1.9, new THREE.MeshLambertMaterial({ color: 0xc0b090 }));
  addBox(ctx, -2.1, DECK_Y + 0.9, -6.4, 0.7, 1.8, 0.6, metalMat);

  // Kajüte: Tisch = Werkbank (Crafting, Taste E)
  const craftTable = new THREE.Group();
  const tableTop = addBox(ctx, 1.55, DECK_Y + 0.78, -9.0, 1.3, 0.08, 0.95, woodMat);
  for (const [lx, lz] of [[1.0, -9.4], [2.1, -9.4], [1.0, -8.6], [2.1, -8.6]]) {
    const leg = addBox(ctx, lx, DECK_Y + 0.37, lz, 0.09, 0.74, 0.09, woodMat, false);
    craftTable.add(leg);
  }
  craftTable.add(tableTop);
  // etwas Werkzeug-Deko auf dem Tisch
  const tool1 = addBox(ctx, 1.3, DECK_Y + 0.87, -9.1, 0.35, 0.07, 0.14, metalMat, false);
  const tool2 = addBox(ctx, 1.85, DECK_Y + 0.87, -8.85, 0.16, 0.07, 0.3, railMat, false);
  craftTable.add(tool1, tool2);
  group.add(craftTable);
  interaction.add({
    object: craftTable,
    prompt: STR.useCraftingTable,
    interact: hooks.onCraftingTable,
  });

  // Kombüse: Arbeitszeile + Herd
  addBox(ctx, -2.05, DECK_Y + 0.45, -3.8, 0.9, 0.9, 3.2, woodMat);
  addBox(ctx, -2.05, DECK_Y + 0.975, -3.0, 0.85, 0.15, 0.9, metalMat);

  // Deck: Kisten (achtern der Bordleiter – der Ausstieg bei z = 10 muss
  // frei bleiben, sonst steht man beim Aufentern in der Kiste)
  addBox(ctx, -2.9, DECK_Y + 0.35, 11.6, 0.7, 0.7, 0.7, woodMat);
  addBox(ctx, -2.9, DECK_Y + 1.0, 11.7, 0.55, 0.55, 0.55, woodMat);
  addBox(ctx, 2.0, DECK_Y + 0.35, -10.9, 0.6, 0.6, 0.6, woodMat);

  // ---- Motorraum: Motor (motor.glb) + Funkgerät (ohne Strom) ----
  // Der Motor ist das Reparatur-Ziel: Prompt und Interaktion kommen aus
  // dem Spielzustand (hooks). motor.setRunning() tauscht das Modell gegen
  // motor-running.glb und schaltet das rote Licht ein.
  // Er steht bündig an der vorderen Wand (gegenüber der Tür, die achtern
  // liegt) und ist um 180° gedreht, damit die Front zur Tür zeigt.
  const MOTOR_Z = 5.4; // Kollisionsbox (±1.2) endet an der Wand bei z = 4.2
  const engineGroup = new THREE.Group();
  engineGroup.position.set(origin.x, origin.y + DECK_Y, origin.z + MOTOR_Z);
  engineGroup.rotation.y = Math.PI;
  group.add(engineGroup);
  const showMotorModel = (file: string): Promise<void> =>
    loadModel(file, 2.3).then(({ template }) => {
      engineGroup.clear();
      const model = template.clone(true);
      // Modell sitzt zentriert – auf den Boden stellen
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      engineGroup.add(model);
    });
  showMotorModel('motor.glb').catch(() => {
    const block = addBox(ctx, 0, DECK_Y + 0.6, MOTOR_Z, 1.5, 1.2, 2.4, engineMat, false);
    engineGroup.attach(block);
  });
  // Kollision: grober Block an der Motorposition
  collision.addFrameBox(
    new THREE.Box3(
      new THREE.Vector3(origin.x - 0.9, origin.y + DECK_Y, origin.z + MOTOR_Z - 1.2),
      new THREE.Vector3(origin.x + 0.9, origin.y + DECK_Y + 1.4, origin.z + MOTOR_Z + 1.2),
    ),
  );
  const motorLight = new THREE.PointLight(0xff2a12, 0, 5, 1.8);
  motorLight.position.set(origin.x, origin.y + DECK_Y + 1.0, origin.z + MOTOR_Z);
  group.add(motorLight);
  const motor: MotorRef = {
    group: engineGroup,
    light: motorLight,
    setRunning() {
      showMotorModel('motor-running.glb').catch(() => {});
      motorLight.intensity = 6;
    },
  };
  interaction.add({
    object: engineGroup,
    prompt: hooks.motorPrompt,
    interact: hooks.onMotorInteract,
  });

  // ---- Telefon an der Steuerbordwand (statt des alten Funkgeräts) ----
  // Die Halterung (telephone-mount.glb) hängt fest an der Wand; das
  // Telefon (telephone.glb) sitzt darauf und lässt sich wie ein normales
  // Item aufheben (Taste E).
  const PHONE_WALL_X = 2.55; // Innenkante Steuerbordwand des Motorraums
  const PHONE_Z = 4.8;
  const PHONE_Y = DECK_Y + 1.45;

  const mountGroup = new THREE.Group();
  mountGroup.position.set(origin.x + PHONE_WALL_X - 0.15, origin.y + PHONE_Y, origin.z + PHONE_Z);
  mountGroup.rotation.y = Math.PI / 2; // Rückwand zur Wand, Front in den Raum
  group.add(mountGroup);
  loadModel('telephone-mount.glb', 1.05)
    .then(({ template }) => {
      mountGroup.add(template.clone(true));
    })
    .catch(() => {
      mountGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.55), metalMat));
    });

  const phoneGroup = new THREE.Group();
  // 0.2 tiefer als die Halterungsmitte: so sitzt das Telefon ganz in der
  // Halterung und ist genau durch deren Öffnung sichtbar
  phoneGroup.position.set(origin.x + PHONE_WALL_X - 0.2, origin.y + PHONE_Y - 0.2, origin.z + PHONE_Z);
  phoneGroup.rotation.y = Math.PI / 2;
  group.add(phoneGroup);
  loadModel('telephone.glb', 0.5)
    .then(({ template }) => {
      phoneGroup.add(template.clone(true));
    })
    .catch(() => {
      phoneGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.3), phoneMat));
    });
  const phoneEntry: Interactable = {
    object: phoneGroup,
    prompt: STR.pickUp,
    interact: () => {
      if (!inventory.pickup('telefon')) {
        UI.toast(STR.inventoryFull);
        return;
      }
      group.remove(phoneGroup);
      interaction.remove(phoneEntry);
      UI.toast(STR.pickedUp(STR.itemNames.telefon));
    },
  };
  interaction.add(phoneEntry);

  // Werkbank im Motorraum
  addBox(ctx, -2.05, DECK_Y + 0.45, 7.7, 0.9, 0.9, 2.0, woodMat);

  // ---- Steuerstand auf der Brücke (Pult, Steuerrad, Fahrhebel) ----
  // Direkt vor der Frontscheibe: Wer davor steht und nach vorn schaut,
  // hat Rad und Hebel im Blick und kann das Steuer übernehmen (Taste E).
  const helmGroup = new THREE.Group();
  group.add(helmGroup);

  // Pult: Sockel (kollidiert) + schräg gestellte Deckplatte
  const pedestal = addBox(ctx, 0, ROOF_Y + 0.45, -9.3, 2.0, 0.9, 0.5, metalMat);
  helmGroup.add(pedestal);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.62), woodMat);
  panel.position.set(origin.x, origin.y + ROOF_Y + 0.97, origin.z - 9.22);
  panel.rotation.x = 0.3;
  helmGroup.add(panel);

  // Steuerrad: Kranz + Speichen + Nabe, leicht zum Steuermann geneigt.
  // `wheelSpin` dreht sich mit dem Einschlag (A/D).
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(origin.x - 0.5, origin.y + ROOF_Y + 1.45, origin.z - 9.1);
  wheelTilt.rotation.x = -0.35;
  helmGroup.add(wheelTilt);
  const wheelSpin = new THREE.Group();
  wheelTilt.add(wheelSpin);
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 18), railMat));
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), railMat);
    spoke.rotation.z = (k * Math.PI) / 4;
    wheelSpin.add(spoke);
    // Griffe außen am Kranz (typisches Ruderrad)
    for (const dir of [1, -1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), woodMat);
      grip.position.set(Math.sin((k * Math.PI) / 4) * -0.36 * dir, Math.cos((k * Math.PI) / 4) * 0.36 * dir, 0);
      grip.rotation.z = (k * Math.PI) / 4;
      wheelSpin.add(grip);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8), metalMat);
  hub.rotation.x = Math.PI / 2;
  wheelSpin.add(hub);

  // Fahrhebel (vorwärts/rückwärts): Arm kippt mit der Hebelstellung (W/S)
  const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.4), metalMat);
  leverBase.position.set(origin.x + 0.6, origin.y + ROOF_Y + 0.96, origin.z - 9.2);
  helmGroup.add(leverBase);
  const leverArm = new THREE.Group();
  leverArm.position.set(origin.x + 0.6, origin.y + ROOF_Y + 1.0, origin.z - 9.2);
  helmGroup.add(leverArm);
  const leverStick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 8), metalMat);
  leverStick.position.y = 0.2;
  leverArm.add(leverStick);
  const leverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), engineMat);
  leverKnob.position.y = 0.42;
  leverArm.add(leverKnob);

  // Unsichtbare Interaktionszone über dem Pult: So greift "E" auch,
  // wenn der Blick geradeaus aus dem Fenster geht (der Ray würde sonst
  // knapp über Rad und Pult hinweggehen).
  const useZone = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.15),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  useZone.position.set(origin.x, origin.y + ROOF_Y + 1.5, origin.z - 9.4);
  helmGroup.add(useZone);

  const helm: HelmRef = {
    group: helmGroup,
    wheelSpin,
    leverArm,
    stand: new THREE.Vector3(origin.x, origin.y + ROOF_Y, origin.z - 8.35),
  };
  interaction.add({
    object: helmGroup,
    prompt: hooks.helmPrompt,
    interact: hooks.onHelmInteract,
  });

  // ---- Freischalten versperrter Räume (z. B. Brücke bei Motorstart) ----
  const unlock = (roomId: string): boolean => {
    const d = doors.get(roomId);
    if (!d) return false;
    doors.delete(roomId);
    d.mesh.parent?.remove(d.mesh);
    collision.removeFrameBox(d.box);
    interaction.remove(d.entry);
    return true;
  };

  // ---- Fahr-Pivot ----
  // Alle Boot-Kinder sind in Originalkoordinaten (origin + lokal)
  // positioniert. Der Pivot sitzt im Bootszentrum; `group` wird um
  // -origin verschoben, sodass Drehungen des Pivots das Boot um sein
  // Zentrum drehen – passend zum BoatFrame der Kollisionswelt.
  const pivot = new THREE.Group();
  pivot.position.copy(origin);
  group.position.set(-origin.x, -origin.y, -origin.z);
  pivot.add(group);
  scene.add(pivot);
  return { pivot, group, ladders, motor, helm, unlock };
}
