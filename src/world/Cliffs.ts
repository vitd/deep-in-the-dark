import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { texturedMat } from '../rendering/Textures';
import { lakeFloorY } from './lake';

// Kreisrunde Steilküste um den ganzen See plus Seeboden-Schüssel.
// Die Oberkante der Klippen verschwindet im Nebel/hinter der Far-Plane
// und wirkt dadurch endlos. Die Begrenzung übernimmt das kreisförmige
// Clamping (clampToLake) in PlayerController/BoatController – die
// Ringwand selbst braucht deshalb keine Kollisionsboxen (gedrehte
// Segmente ließen sich mit der AABB-Kollisionswelt ohnehin nicht
// sauber abbilden).

// Unregelmäßiger Felsbrocken: Ikosaeder mit richtungsabhängigem
// Rauschen, damit keine gleichmäßigen Geodät-Flächen entstehen. Das
// Rauschen hängt nur von der Richtung ab – gleiche Ecken bekommen den
// gleichen Versatz, daher entstehen keine Risse zwischen Dreiecken.
function klumpen(s: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(s, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    d.copy(v).normalize();
    const n =
      Math.sin(d.x * 4.1 + seed) * Math.cos(d.y * 3.3 - seed * 0.7) +
      Math.sin(d.z * 5.2 + d.x * 1.3 + seed);
    const f = 1 + n * 0.11;
    pos.setXYZ(i, v.x * f, v.y * f * 0.92, v.z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildCliffs(scene: THREE.Scene, collision: CollisionWorld): void {
  const L = CONFIG.world.lake;

  // Steilküste: Zylinderring, von innen gesehen. Kacheldichte wie die
  // alte Wand (~10 m pro Kachel): Umfang ~6283 m, Höhe ~330 m.
  const top = 220;
  const bottom = -L.centerDepth - 10;
  const wallMat = texturedMat('rock.png', 630, 33, 0xb8c0c6);
  wallMat.side = THREE.BackSide;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(L.radius, L.radius, top - bottom, 96, 1, true),
    wallMat,
  );
  ring.position.set(L.center.x, (top + bottom) / 2, L.center.z);
  scene.add(ring);

  // x-Position der Westküsten-Wand auf Höhe z (Kreisbogen)
  const faceX = (z: number): number => L.center.x - Math.sqrt(L.radius * L.radius - z * z);

  // Felsausbrüche: überlappende, leicht verformte Blöcke bilden an der
  // Wand eine zerklüftete Basis statt einzelner Würfel. Sie sitzen in
  // Gruppen am Fuß der Wand, unten bis über die Wasserlinie.
  const felsMat = texturedMat('rock.png', 1, 1, 0x99a3aa);
  felsMat.flatShading = true;
  const anker = [
    { y: -15, z: -52, s: 10 }, { y: -13, z: -24, s: 11 }, { y: -14, z: 4, s: 12 },
    { y: -13, z: 32, s: 10 }, { y: -15, z: 60, s: 11 }, { y: -11, z: -74, s: 9 },
    { y: -4, z: -36, s: 8 }, { y: -3, z: 14, s: 9 }, { y: -2, z: 46, s: 8 },
    { y: 3, z: -10, s: 6 }, { y: 4, z: 30, s: 6 }, { y: 2, z: -58, s: 6 },
    { y: 12, z: 8, s: 6 }, { y: 20, z: 34, s: 6 }, { y: 26, z: -26, s: 6 },
  ];
  for (const a of anker) {
    for (let k = 0; k < 3; k++) {
      const s = a.s * (0.62 + ((k * 53) % 7) / 7 * 0.7);
      const rock = new THREE.Mesh(klumpen(s, a.z + k * 0.7), felsMat);
      const dz = ((((k * 29) % 9) / 9) - 0.5) * a.s * 1.5;
      const dy = ((((k * 17) % 7) / 7) - 0.5) * a.s * 0.9;
      rock.position.set(faceX(a.z + dz) - s * 0.35, a.y + dy, a.z + dz);
      rock.rotation.set(a.y * 0.02 + k * 0.8, a.z * 0.03, k * 1.1);
      scene.add(rock);
      collision.addBox(new THREE.Box3().setFromObject(rock));
    }
  }

  // Seeboden: ebener Küstenschelf, zur Mitte hin auf centerDepth
  // abfallend (Profil siehe lake.ts). Außerhalb des Sees läuft die
  // Fläche hinter der Ringwand einfach weiter – unsichtbar.
  // Auflösung so gewählt, dass eine Gitterkante ~6 m misst – fein genug
  // für die Reliefwellen aus lake.ts, ohne das Vertex-Budget zu sprengen.
  const floorSize = L.radius * 2 + 40;
  const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 340, 340);
  floorGeo.rotateX(-Math.PI / 2);
  const vp = floorGeo.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    vp.setY(i, lakeFloorY(vp.getX(i) + L.center.x, vp.getZ(i) + L.center.z));
  }
  floorGeo.computeVertexNormals();
  // Sandkachel alle 4 m – bei der Sichtweite unter Wasser (Nebel, ~25 m)
  // bleibt das Muster erkennbar, ohne zu einem Brei zu verlaufen.
  const sandRepeat = floorSize / 4;
  const floor = new THREE.Mesh(
    floorGeo,
    texturedMat('sand.png', sandRepeat, sandRepeat),
  );
  floor.position.set(L.center.x, 0, L.center.z);
  scene.add(floor);

  // Kollisionsplatte für den Schelf vor der Westküste als Rückfall-
  // ebene. Sie liegt bei seabedY und damit immer unter dem Sand: das
  // Relief hebt den Boden nur an (siehe lake.ts), und geführt wird der
  // Spieler ohnehin von clampToBounds entlang lakeFloorY.
  collision.addBox(new THREE.Box3(
    new THREE.Vector3(-70, CONFIG.world.seabedY - 0.4, -130),
    new THREE.Vector3(50, CONFIG.world.seabedY, 130),
  ));

  // Das lose Geröll und die Felsklippen am Grund kommen aus Seabed.ts.
}
