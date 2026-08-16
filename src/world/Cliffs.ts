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

export function buildCliffs(scene: THREE.Scene, collision: CollisionWorld): void {
  const L = CONFIG.world.lake;
  const matDark = texturedMat('stone.png', 2, 2, 0xb0b0b8);

  // Steilküste: Zylinderring, von innen gesehen. Kacheldichte wie die
  // alte Wand (~10 m pro Kachel): Umfang ~6283 m, Höhe ~330 m.
  const top = 220;
  const bottom = -L.centerDepth - 10;
  const wallMat = texturedMat('stone.png', 630, 33);
  wallMat.side = THREE.BackSide;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(L.radius, L.radius, top - bottom, 96, 1, true),
    wallMat,
  );
  ring.position.set(L.center.x, (top + bottom) / 2, L.center.z);
  scene.add(ring);

  // x-Position der Westküsten-Wand auf Höhe z (Kreisbogen)
  const faceX = (z: number): number => L.center.x - Math.sqrt(L.radius * L.radius - z * z);

  // Vorspringende Felsblöcke nahe dem Spawn für etwas Struktur
  const rng = [
    { y: -6, z: -30, s: 5 }, { y: 2, z: 10, s: 6 }, { y: 14, z: -12, s: 7 },
    { y: -9, z: 40, s: 4 }, { y: 30, z: 22, s: 8 }, { y: 8, z: -55, s: 6 },
    { y: 48, z: -5, s: 9 }, { y: -4, z: 68, s: 5 }, { y: 70, z: 30, s: 10 },
  ];
  for (const r of rng) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(r.s, r.s, r.s), matDark);
    rock.position.set(faceX(r.z) + r.s * 0.25 - 1.5, r.y, r.z);
    scene.add(rock);
    collision.addBox(new THREE.Box3().setFromObject(rock));
  }

  // Seeboden: ebener Küstenschelf, zur Mitte hin auf centerDepth
  // abfallend (Profil siehe lake.ts). Außerhalb des Sees läuft die
  // Fläche hinter der Ringwand einfach weiter – unsichtbar.
  const floorSize = L.radius * 2 + 40;
  const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 96, 96);
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

  // Begehbare Kollisionsplatte für den Schelf vor der Westküste (dort
  // spielt sich Tauchen/Sammeln ab; deckt den alten Spielbereich ab)
  collision.addBox(new THREE.Box3(
    new THREE.Vector3(-70, CONFIG.world.seabedY - 0.4, -130),
    new THREE.Vector3(50, CONFIG.world.seabedY, 130),
  ));

  // verstreute Felsen am Boden
  const rocks = [
    { x: -48, z: -8, s: 1.6 }, { x: -44, z: 14, s: 2.2 }, { x: -36, z: -18, s: 1.2 },
    { x: -20, z: 22, s: 1.8 }, { x: -12, z: -12, s: 2.6 }, { x: -30, z: 34, s: 1.4 },
  ];
  for (const r of rocks) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(r.s, r.s * 0.8, r.s * 1.2), matDark);
    rock.position.set(r.x, CONFIG.world.seabedY + r.s * 0.4, r.z);
    scene.add(rock);
  }
}
