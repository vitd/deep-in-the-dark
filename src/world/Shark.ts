import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { clampSwimY, insideLake, randomSwimY, roamPoint } from './lake';

// Haie: Sie patrouillieren im ganzen See unter Wasser; kommt der Spieler
// (im Wasser) einem zu nah, greift er an. Ein Biss verletzt. Mit dem
// Hammer in der Hand lässt sich der Angriff abwehren – der Hai flieht
// dann und lässt für längere Zeit von einem ab.
//
// Wie bei den Fischen lebt immer nur eine Handvoll rund um den Spieler:
// Wer zu weit zurückfällt, wird andernorts wieder eingesetzt. So ist
// nirgends im See sicheres Wasser.

const S = CONFIG.shark;
const R = CONFIG.revier;

type SharkState = 'patrol' | 'approach' | 'retreat';

export class Shark {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private currentClip = '';
  private state: SharkState = 'patrol';
  private heading = 0;
  private cooldown = 0; // Sekunden bis zum nächsten möglichen Angriff
  private turnTimer = 0;
  private retreatDir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpPoint = { x: 0, z: 0 };

  constructor(scene: THREE.Scene, private readonly onBite: () => void) {
    scene.add(this.group);
    loadModel('shark.glb', S.size)
      .then(({ template, clips }) => {
        // Modell schaut nach -z, Bewegung nimmt +z als vorwärts an
        template.rotation.y = Math.PI;
        const model = template.clone(true);
        this.group.add(model);
        this.mixer = new THREE.AnimationMixer(model);
        this.clips = clips;
        this.play('idle');
      })
      .catch(() => {
        // Fallback: grober Box-Hai
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.8, 3.0),
          new THREE.MeshLambertMaterial({ color: 0x5a6a74 }),
        );
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.7, 0.8),
          new THREE.MeshLambertMaterial({ color: 0x46545c }),
        );
        fin.position.set(0, 0.7, 0.2);
        this.group.add(body, fin);
      });
  }

  // Setzt den Hai neu ins Wasser: im Ring um `center`, mit Abstand zum
  // Boot. Wird beim Erstbesetzen und beim Recyceln benutzt.
  placeNear(center: THREE.Vector3, boatCenter: THREE.Vector3, minR: number = S.spawnMin): void {
    roamPoint(center, minR, S.spawnMax, this.tmpPoint, {
      x: boatCenter.x,
      z: boatCenter.z,
      r: R.bootAbstand,
    });
    this.group.position.set(
      this.tmpPoint.x,
      randomSwimY(this.tmpPoint.x, this.tmpPoint.z, S.minY, S.maxY),
      this.tmpPoint.z,
    );
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'patrol';
  }

  private play(name: string): void {
    if (!this.mixer || this.currentClip === name) return;
    const clip = THREE.AnimationClip.findByName(this.clips, name);
    if (!clip) return;
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.play();
    this.currentClip = name;
  }

  // Hammerschlag des Spielers: trifft, wenn der Hai nah ist und grob in
  // Blickrichtung liegt. Der Hai flieht.
  trySwing(playerEye: THREE.Vector3, lookDir: THREE.Vector3): boolean {
    const toShark = this.tmp.copy(this.group.position).sub(playerEye);
    const dist = toShark.length();
    if (dist > S.swingRange) return false;
    toShark.normalize();
    if (toShark.dot(lookDir) < 0.25) return false;
    this.repel(playerEye);
    return true;
  }

  private repel(from: THREE.Vector3): void {
    this.state = 'retreat';
    this.cooldown = S.repelSeconds;
    this.retreatDir.copy(this.group.position).sub(from).setY(0).normalize();
    if (this.retreatDir.lengthSq() < 0.01) this.retreatDir.set(1, 0, 0);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerInWater: boolean,
    boatCenter: THREE.Vector3,
  ): void {
    this.mixer?.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pos = this.group.position;
    const distToPlayer = pos.distanceTo(playerPos);

    // Weit abgeschlagen? Dann taucht er andernorts wieder auf. Nie
    // während eines Angriffs – sonst verschwände er vor der Nase.
    if (this.state !== 'approach' && distToPlayer > S.despawnRadius) {
      this.placeNear(playerPos, boatCenter);
      return;
    }

    switch (this.state) {
      case 'patrol': {
        this.play('idle');
        this.turnTimer -= dt;
        if (this.turnTimer <= 0) {
          this.heading += Math.sin(pos.x * 0.7 + pos.z * 1.3) * 1.2;
          this.turnTimer = 3 + ((Math.abs(pos.x * 13) % 40) / 10);
        }
        this.moveHorizontal(this.heading, S.patrolSpeed, dt, boatCenter);
        this.approachDepth(S.cruiseY, dt);
        if (playerInWater && this.cooldown <= 0 && distToPlayer < S.aggroRadius) {
          this.state = 'approach';
        }
        break;
      }

      case 'approach': {
        this.play('run');
        if (!playerInWater || distToPlayer > S.aggroRadius * 1.5) {
          this.state = 'patrol';
          break;
        }
        // direkt auf den Spieler zu (voll 3D, aber nie über die Oberfläche)
        const dir = this.tmp.copy(playerPos).sub(pos);
        dir.y = Math.min(dir.y, S.maxY - pos.y + 1); // nicht aus dem Wasser springen
        dir.normalize();
        this.heading = Math.atan2(dir.x, dir.z);
        pos.addScaledVector(dir, S.speed * dt);
        this.clampToWater();
        if (distToPlayer < S.attackRange) {
          this.play('attack');
          this.onBite();
          this.state = 'retreat';
          this.cooldown = S.retreatSeconds;
          this.retreatDir.copy(pos).sub(playerPos).setY(0).normalize();
          if (this.retreatDir.lengthSq() < 0.01) this.retreatDir.set(1, 0, 0);
        }
        break;
      }

      case 'retreat': {
        this.play('run');
        this.heading = Math.atan2(this.retreatDir.x, this.retreatDir.z);
        this.moveHorizontal(this.heading, S.speed * 0.8, dt, boatCenter);
        this.approachDepth(S.cruiseY, dt);
        if (this.cooldown <= 0) this.state = 'patrol';
        break;
      }
    }

    this.group.rotation.y = this.heading;
  }

  private moveHorizontal(
    heading: number,
    speed: number,
    dt: number,
    boatCenter: THREE.Vector3,
  ): void {
    const pos = this.group.position;
    const nx = pos.x + Math.sin(heading) * speed * dt;
    const nz = pos.z + Math.cos(heading) * speed * dt;
    const bdx = nx - boatCenter.x;
    const bdz = nz - boatCenter.z;
    const inBoat = bdx * bdx + bdz * bdz < R.bootAbstand * R.bootAbstand;
    if (inBoat || !insideLake(nx, nz, R.uferAbstand)) {
      this.heading += Math.PI * 0.85;
      return;
    }
    pos.x = nx;
    pos.z = nz;
  }

  private approachDepth(targetY: number, dt: number): void {
    const pos = this.group.position;
    pos.y += (targetY - pos.y) * Math.min(1, dt * 0.6);
    this.clampToWater();
  }

  private clampToWater(): void {
    const pos = this.group.position;
    pos.y = clampSwimY(pos.x, pos.z, pos.y, S.minY, S.maxY);
  }

  // Debug: Hai in die Nähe holen
  teleportNear(playerPos: THREE.Vector3): void {
    this.group.position.set(playerPos.x + 8, Math.min(S.maxY, playerPos.y - 2), playerPos.z);
    this.state = 'patrol';
    this.cooldown = 0;
  }
}

// Verwaltet die Haie rund um den Spieler. Nach außen verhält sich der
// Schwarm wie der frühere Einzelhai (trySwing/teleportNear).
export class SharkManager {
  private readonly sharks: Shark[] = [];
  private populated = false;

  constructor(scene: THREE.Scene, onBite: () => void) {
    for (let i = 0; i < S.count; i++) this.sharks.push(new Shark(scene, onBite));
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerInWater: boolean,
    boatCenter: THREE.Vector3,
  ): void {
    if (!this.populated) {
      this.populated = true;
      for (const s of this.sharks) s.placeNear(playerPos, boatCenter);
    }
    for (const s of this.sharks) s.update(dt, playerPos, playerInWater, boatCenter);
  }

  // Hammerschlag: trifft den ersten Hai in Reichweite
  trySwing(playerEye: THREE.Vector3, lookDir: THREE.Vector3): boolean {
    for (const s of this.sharks) {
      if (s.trySwing(playerEye, lookDir)) return true;
    }
    return false;
  }

  // Debug: den entferntesten Hai heranholen (die nahen bleiben, wo sie sind)
  teleportNear(playerPos: THREE.Vector3): void {
    let far: Shark | null = null;
    let farDist = -1;
    for (const s of this.sharks) {
      const d = s.group.position.distanceToSquared(playerPos);
      if (d > farDist) {
        farDist = d;
        far = s;
      }
    }
    far?.teleportNear(playerPos);
  }

  // Für die Minimap: der Hai, der dem Spieler am nächsten ist
  nearestGroup(from: THREE.Vector3): THREE.Object3D {
    let best = this.sharks[0].group;
    let bestDist = Infinity;
    for (const s of this.sharks) {
      const d = s.group.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = s.group;
      }
    }
    return best;
  }
}
