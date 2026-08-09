import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { BoatFrame } from './BoatFrame';

// Das Seemonster: Es gibt genau eines, und es haust weit draußen auf dem
// offenen Meer in seinem Revier. Schwimmer ohne Waffe oder Schutz tötet
// es beim ersten Kontakt. Kommt das Schiff in sein Revier, rammt es den
// Rumpf – nach CONFIG.seaMonster.shipHits Treffern sinkt das Schiff.
// Eine passende Waffe dagegen kommt später über das Crafting.

const M = CONFIG.seaMonster;

type MonsterState = 'patrol' | 'attackShip' | 'attackPlayer' | 'retreat';

export class SeaMonster {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private state: MonsterState = 'patrol';
  private heading = 0;
  private cooldown = 0; // Sekunden bis zum nächsten möglichen Angriff
  private turnTimer = 0;
  // per Cheat herbeigerufen: Reviergrenzen gelten nicht, bis es von
  // selbst wieder in sein Revier zurückgefunden hat
  private freeChase = false;
  // Schiff sinkt bereits: keine weiteren Angriffe aufs Wrack
  private dormant = false;
  private readonly retreatDir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly frame: BoatFrame,
    private readonly onShipHit: () => void,
    private readonly onPlayerCaught: () => void,
  ) {
    this.group.position.set(M.spawn.x, M.spawn.y, M.spawn.z);
    scene.add(this.group);
    loadModel('seamonster.glb', M.size)
      .then(({ template, clips }) => {
        // Modell schaut nach -z, Bewegung nimmt +z als vorwärts an
        template.rotation.y = Math.PI;
        const model = template.clone(true);
        this.group.add(model);
        this.mixer = new THREE.AnimationMixer(model);
        const clip = THREE.AnimationClip.findByName(clips, 'walk');
        if (clip) this.mixer.clipAction(clip).play();
      })
      .catch(() => {
        // Fallback: grober Kasten in Monstergröße
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(3, 3, M.size),
          new THREE.MeshLambertMaterial({ color: 0x2e4a3f }),
        );
        this.group.add(body);
      });
  }

  // Schiff ist getroffen und sinkt: das Monster lässt vom Wrack ab.
  setDormant(): void {
    this.dormant = true;
    if (this.state === 'attackShip') this.state = 'patrol';
  }

  // Abstand des Monsterzentrums zur Rumpf-Außenkante (Rumpf ist im
  // Boots-Rahmen ein achsenparalleles Rechteck, siehe boatLayout).
  private distToHull(): number {
    const local = this.frame.toLocal(this.tmp.copy(this.group.position));
    const lx = local.x - this.frame.center.x;
    const lz = local.z - this.frame.center.z;
    const dx = Math.max(-4 - lx, 0, lx - 4);
    const dz = Math.max(-12 - lz, 0, lz - 12);
    return Math.hypot(dx, dz);
  }

  private inTerritory(margin: number): boolean {
    const t = M.territory;
    const pos = this.group.position;
    return (
      pos.x > t.minX - margin &&
      pos.x < t.maxX + margin &&
      pos.z > t.minZ - margin &&
      pos.z < t.maxZ + margin
    );
  }

  update(dt: number, playerPos: THREE.Vector3, playerInWater: boolean, boatCenter: THREE.Vector3): void {
    this.mixer?.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const pos = this.group.position;
    const distToPlayer = pos.distanceTo(playerPos);
    const distToBoat = pos.distanceTo(boatCenter);

    switch (this.state) {
      case 'patrol': {
        const t = M.territory;
        const inside =
          pos.x > t.minX && pos.x < t.maxX && pos.z > t.minZ && pos.z < t.maxZ;
        if (!inside) {
          // zurück Richtung Reviermitte steuern
          const cx = (t.minX + t.maxX) / 2;
          const cz = (t.minZ + t.maxZ) / 2;
          this.heading = Math.atan2(cx - pos.x, cz - pos.z);
        } else {
          this.freeChase = false;
          this.turnTimer -= dt;
          if (this.turnTimer <= 0) {
            this.heading += Math.sin(pos.x * 0.5 + pos.z * 1.1) * 1.3;
            this.turnTimer = 4 + ((Math.abs(pos.z * 17) % 50) / 10);
          }
        }
        this.moveForward(M.patrolSpeed, dt);
        this.approachDepth(M.cruiseY, dt);
        if (this.cooldown <= 0) {
          // Schwimmer haben Vorrang vor dem Schiff – wer ohne Schutz im
          // Wasser ist, wird gejagt
          if (playerInWater && distToPlayer < M.aggroRadius) {
            this.state = 'attackPlayer';
          } else if (!this.dormant && distToBoat < M.aggroRadius) {
            this.state = 'attackShip';
          }
        }
        break;
      }

      case 'attackPlayer': {
        if (
          !playerInWater ||
          distToPlayer > M.aggroRadius * 1.5 ||
          (!this.freeChase && !this.inTerritory(M.chaseMargin))
        ) {
          this.state = 'patrol';
          break;
        }
        this.chase(playerPos, dt);
        if (distToPlayer < M.killRange) {
          this.onPlayerCaught();
          this.beginRetreat(playerPos);
        }
        break;
      }

      case 'attackShip': {
        if (
          this.dormant ||
          distToBoat > M.aggroRadius * 1.5 ||
          (!this.freeChase && !this.inTerritory(M.chaseMargin))
        ) {
          this.state = 'patrol';
          break;
        }
        // Schwimmer im Wasser sind das leichtere Ziel
        if (playerInWater && distToPlayer < M.aggroRadius) {
          this.state = 'attackPlayer';
          break;
        }
        this.chase(boatCenter, dt, M.attackY);
        if (this.distToHull() < M.shipHitRange) {
          this.onShipHit();
          this.beginRetreat(boatCenter);
        }
        break;
      }

      case 'retreat': {
        this.heading = Math.atan2(this.retreatDir.x, this.retreatDir.z);
        this.moveForward(M.attackSpeed * 0.7, dt);
        this.approachDepth(M.cruiseY, dt);
        if (this.cooldown <= 0) this.state = 'patrol';
        break;
      }
    }

    this.group.rotation.y = this.heading;
  }

  // direkt aufs Ziel zu (voll 3D, aber nie über die Oberfläche)
  private chase(target: THREE.Vector3, dt: number, targetY?: number): void {
    const pos = this.group.position;
    const dir = this.tmp.copy(target).sub(pos);
    if (targetY !== undefined) dir.y = targetY - pos.y;
    dir.y = Math.min(dir.y, M.maxY - pos.y + 1); // nicht aus dem Wasser springen
    dir.normalize();
    this.heading = Math.atan2(dir.x, dir.z);
    pos.addScaledVector(dir, M.attackSpeed * dt);
    this.clampToWater();
  }

  private beginRetreat(from: THREE.Vector3): void {
    this.state = 'retreat';
    this.cooldown = M.retreatSeconds;
    this.retreatDir.copy(this.group.position).sub(from).setY(0).normalize();
    if (this.retreatDir.lengthSq() < 0.01) this.retreatDir.set(1, 0, 0);
  }

  private moveForward(speed: number, dt: number): void {
    const pos = this.group.position;
    const b = CONFIG.world.bounds;
    pos.x = Math.max(b.minX + 2, Math.min(b.maxX - 2, pos.x + Math.sin(this.heading) * speed * dt));
    pos.z = Math.max(b.minZ + 2, Math.min(b.maxZ - 2, pos.z + Math.cos(this.heading) * speed * dt));
  }

  private approachDepth(targetY: number, dt: number): void {
    const pos = this.group.position;
    pos.y += (targetY - pos.y) * Math.min(1, dt * 0.6);
    this.clampToWater();
  }

  private clampToWater(): void {
    const pos = this.group.position;
    pos.y = Math.max(M.minY, Math.min(M.maxY, pos.y));
  }

  // Debug: Monster in die Nähe holen; es jagt dann auch außerhalb
  // seines Reviers, bis es von selbst dorthin zurückkehrt
  teleportNear(playerPos: THREE.Vector3): void {
    this.group.position.set(playerPos.x + 25, M.cruiseY, playerPos.z);
    this.state = 'patrol';
    this.cooldown = 0;
    this.freeChase = true;
  }
}
