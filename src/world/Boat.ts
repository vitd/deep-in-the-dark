import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { STR } from '../ui/strings.de';
import { BOAT_LAYOUT, DECK_Y, ROOF_Y } from './boatLayout';
import { addBox, buildRoom, RoomBuildContext } from './Room';
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
const radioMat = new THREE.MeshLambertMaterial({ color: 0x3a4a40 });
const woodMat = texturedMat('plank.png', 1, 1);

export interface BoatResult {
  group: THREE.Group;
  ladders: LadderDef[];
  motor: MotorRef;
}

export interface BoatHooks {
  // Wird gerufen, wenn der Spieler die Werkbank (Tisch in der Kajüte) benutzt
  onCraftingTable: () => void;
  // Motor: dynamischer Prompt + Interaktion (Material anwenden)
  motorPrompt: () => string;
  onMotorInteract: () => void;
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
  hooks: BoatHooks,
): BoatResult {
  const origin = new THREE.Vector3(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y, CONFIG.world.boatPos.z);
  const group = new THREE.Group();
  const ctx: RoomBuildContext = { origin, group, collision, interaction };

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
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6.5, 8), woodMat);
  boom.position.set(origin.x, origin.y + mastBase + 3.3, origin.z + mastZ + 3.0);
  boom.rotation.x = Math.PI / 2 - 0.35; // schräg nach oben-achtern
  group.add(boom);
  // Taue vom Masttop zum Baumende
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.1, 6), glassMat);
  rope.position.set(origin.x, origin.y + mastBase + 5.5, origin.z + mastZ + 4.4);
  rope.rotation.x = -0.55;
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
  // Fensterband vorn (über die ganze Front) und an den Seiten
  addBox(ctx, 0, 5.55, -9.92, 4.8, 0.75, 0.08, glassMat, false);
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
  // motor-running.glb und schaltet das rote Glühen + Licht ein.
  // Er steht bündig an der vorderen Wand (gegenüber der Tür, die achtern
  // liegt) und ist um 180° gedreht, damit die Front zur Tür zeigt.
  const MOTOR_Z = 5.4; // Kollisionsbox (±1.2) endet an der Wand bei z = 4.2
  const engineGroup = new THREE.Group();
  engineGroup.position.set(origin.x, origin.y + DECK_Y, origin.z + MOTOR_Z);
  engineGroup.rotation.y = Math.PI;
  group.add(engineGroup);
  const glowMats: THREE.MeshStandardMaterial[] = [];
  const showMotorModel = (file: string): Promise<void> =>
    loadModel(file, 2.3).then(({ template }) => {
      engineGroup.clear();
      glowMats.length = 0;
      const model = template.clone(true);
      // Modell sitzt zentriert – auf den Boden stellen
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;
      engineGroup.add(model);
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Materialien klonen, damit das Glühen nur diesen Motor trifft
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = mats.map((m) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          glowMats.push(c);
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      });
    });
  showMotorModel('motor.glb').catch(() => {
    const block = addBox(ctx, 0, DECK_Y + 0.6, MOTOR_Z, 1.5, 1.2, 2.4, engineMat, false);
    engineGroup.attach(block);
  });
  // Kollision: grober Block an der Motorposition
  collision.addBox(
    new THREE.Box3(
      new THREE.Vector3(origin.x - 0.9, origin.y + DECK_Y, origin.z + MOTOR_Z - 1.2),
      new THREE.Vector3(origin.x + 0.9, origin.y + DECK_Y + 1.4, origin.z + MOTOR_Z + 1.2),
    ),
  );
  const motorLight = new THREE.PointLight(0xff2a12, 0, 5, 1.8);
  motorLight.position.set(origin.x, origin.y + DECK_Y + 1.0, origin.z + MOTOR_Z);
  group.add(motorLight);
  const glow = (): void => {
    for (const m of glowMats) {
      m.emissive = new THREE.Color(0xb01808);
      m.emissiveIntensity = 0.9;
    }
  };
  const motor: MotorRef = {
    group: engineGroup,
    light: motorLight,
    setRunning() {
      // laufendes Modell einwechseln; das Glühen erst danach setzen,
      // weil showMotorModel die glowMats neu befüllt
      showMotorModel('motor-running.glb').then(glow).catch(glow);
      motorLight.intensity = 6;
    },
  };
  interaction.add({
    object: engineGroup,
    prompt: hooks.motorPrompt,
    interact: hooks.onMotorInteract,
  });

  const radioGroup = new THREE.Group();
  const radioBody = addBox(ctx, 2.2, DECK_Y + 1.4, 4.8, 0.5, 0.35, 0.7, radioMat, false);
  const antenna = addBox(ctx, 2.3, DECK_Y + 1.95, 4.6, 0.05, 0.75, 0.05, metalMat, false);
  const radioShelf = addBox(ctx, 2.25, DECK_Y + 1.18, 4.8, 0.55, 0.08, 0.8, woodMat, false);
  radioGroup.add(radioBody, antenna, radioShelf);
  interaction.add({ object: radioGroup, prompt: STR.radioDead });
  group.add(radioGroup);

  // Werkbank im Motorraum
  addBox(ctx, -2.05, DECK_Y + 0.45, 7.7, 0.9, 0.9, 2.0, woodMat);

  scene.add(group);
  return { group, ladders, motor };
}
