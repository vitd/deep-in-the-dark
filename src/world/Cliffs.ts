import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { texturedMat } from '../rendering/Textures';

// "Unendlich hohe" Klippenwand entlang einer Weltseite. Die Oberkante
// verschwindet im Nebel/hinter der Far-Plane und wirkt dadurch endlos.

export function buildCliffs(scene: THREE.Scene, collision: CollisionWorld): void {
  const mat = texturedMat('fels.png', 40, 24);
  const matDark = texturedMat('fels.png', 2, 2, 0xb0b0b8);

  const x = CONFIG.world.cliffX;
  const height = 220;
  const bottom = CONFIG.world.seabedY - 4;

  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, height - bottom, 400), mat);
  wall.position.set(x - 4, bottom + (height - bottom) / 2, 0);
  scene.add(wall);
  collision.addBox(new THREE.Box3().setFromObject(wall));

  // Vorspringende Felsblöcke für etwas Struktur
  const rng = [
    { y: -6, z: -30, s: 5 }, { y: 2, z: 10, s: 6 }, { y: 14, z: -12, s: 7 },
    { y: -9, z: 40, s: 4 }, { y: 30, z: 22, s: 8 }, { y: 8, z: -55, s: 6 },
    { y: 48, z: -5, s: 9 }, { y: -4, z: 68, s: 5 }, { y: 70, z: 30, s: 10 },
  ];
  for (const r of rng) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(r.s, r.s, r.s), matDark);
    rock.position.set(x + r.s * 0.25 - 1.5, r.y, r.z);
    scene.add(rock);
    collision.addBox(new THREE.Box3().setFromObject(rock));
  }

  // Meeresboden
  const seabed = new THREE.Mesh(
    new THREE.BoxGeometry(120, 0.4, 260),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5a }),
  );
  seabed.position.set(-10, CONFIG.world.seabedY - 0.2, 0);
  scene.add(seabed);
  collision.addBox(new THREE.Box3().setFromObject(seabed));

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
