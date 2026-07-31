import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';

// Der Hai: Es gibt genau einen. Er patrouilliert unter Wasser; kommt der
// Spieler (im Wasser) in seine Nähe, greift er an. Ein Biss verletzt.
// Mit dem Hammer in der Hand lässt sich der Angriff abwehren – der Hai
// flieht dann und lässt für längere Zeit von einem ab.

const S = CONFIG.shark;

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

  constructor(scene: THREE.Scene, private readonly onBite: () => void) {
    this.group.position.set(S.spawn.x, S.spawn.y, S.spawn.z);
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

  update(dt: number, playerPos: THREE.Vector3, playerInWater: boolean): void {
    this.mixer?.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pos = this.group.position;
    const distToPlayer = pos.distanceTo(playerPos);

    switch (this.state) {
      case 'patrol': {
        this.play('idle');
        this.turnTimer -= dt;
        if (this.turnTimer <= 0) {
          this.heading += (Math.sin(pos.x * 0.7 + pos.z * 1.3) * 1.2);
          this.turnTimer = 3 + ((Math.abs(pos.x * 13) % 40) / 10);
        }
        this.moveHorizontal(this.heading, S.patrolSpeed, dt);
        this.approachDepth(S.spawn.y, dt);
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
        this.moveHorizontal(this.heading, S.speed * 0.8, dt);
        this.approachDepth(S.spawn.y, dt);
        if (this.cooldown <= 0) this.state = 'patrol';
        break;
      }
    }

    this.group.rotation.y = this.heading;
  }

  private moveHorizontal(heading: number, speed: number, dt: number): void {
    const pos = this.group.position;
    const nx = pos.x + Math.sin(heading) * speed * dt;
    const nz = pos.z + Math.cos(heading) * speed * dt;
    const a = CONFIG.fish.area;
    const b = CONFIG.fish.avoid;
    const outside = nx < a.minX || nx > a.maxX || nz < a.minZ || nz > a.maxZ;
    const inBoat = nx > b.minX && nx < b.maxX && nz > b.minZ && nz < b.maxZ;
    if (outside || inBoat) {
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
    pos.y = Math.max(S.minY, Math.min(S.maxY, pos.y));
  }

  // Debug: Hai in die Nähe holen
  teleportNear(playerPos: THREE.Vector3): void {
    this.group.position.set(playerPos.x + 8, Math.min(S.maxY, playerPos.y - 2), playerPos.z);
    this.state = 'patrol';
    this.cooldown = 0;
  }
}
