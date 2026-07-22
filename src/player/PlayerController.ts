import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { LadderDef } from '../world/Ladder';
import { Ocean } from '../world/Ocean';
import { MouseLook } from './MouseLook';

// Kinematischer First-Person-Controller mit vier Zuständen:
// Oberflächenschwimmen, Tauchen, Leiterklettern, Gehen (an Deck / in Räumen).

export enum PlayerState {
  SwimSurface = 'SWIM',
  Dive = 'DIVE',
  Climb = 'CLIMB',
  Walk = 'WALK',
}

const P = CONFIG.player;

export class PlayerController {
  // `position` ist die Fußposition des Spielers.
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  state = PlayerState.SwimSurface;
  grounded = false;

  private ladder: LadderDef | null = null;
  private readonly tmpF = new THREE.Vector3();
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpMove = new THREE.Vector3();

  constructor(
    readonly look: MouseLook,
    private readonly collision: CollisionWorld,
    private readonly ocean: Ocean,
  ) {}

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.position).setY(this.position.y + P.eyeHeight);
  }

  eyeY(): number {
    return this.position.y + P.eyeHeight;
  }

  startClimb(ladder: LadderDef): void {
    this.ladder = ladder;
    this.state = PlayerState.Climb;
    this.velocity.set(0, 0, 0);
    this.position.x = ladder.standX;
    this.position.z = ladder.standZ;
    this.position.y = Math.max(ladder.bottomY, Math.min(this.position.y, ladder.topY - 0.2));
  }

  update(dt: number, keys: Set<string>): void {
    switch (this.state) {
      case PlayerState.SwimSurface:
        this.updateSwimSurface(dt, keys);
        break;
      case PlayerState.Dive:
        this.updateDive(dt, keys);
        break;
      case PlayerState.Climb:
        this.updateClimb(dt, keys);
        break;
      case PlayerState.Walk:
        this.updateWalk(dt, keys);
        break;
    }
    this.clampToBounds();
  }

  private inputAxes(keys: Set<string>): { fwd: number; strafe: number } {
    let fwd = 0;
    let strafe = 0;
    if (keys.has('KeyW')) fwd += 1;
    if (keys.has('KeyS')) fwd -= 1;
    if (keys.has('KeyD')) strafe += 1;
    if (keys.has('KeyA')) strafe -= 1;
    return { fwd, strafe };
  }

  // ---- Oberflächenschwimmen: Höhe folgt den Wellen ----
  private updateSwimSurface(dt: number, keys: Set<string>): void {
    const { fwd, strafe } = this.inputAxes(keys);
    const move = this.tmpMove.set(0, 0, 0);
    move.addScaledVector(this.look.horizForward(this.tmpF), fwd);
    move.addScaledVector(this.look.right(this.tmpR), strafe);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(P.swimSpeed);

    // Abtauchen: Taste C oder steil nach unten blicken + vorwärts
    if (keys.has('KeyC') || (fwd > 0 && this.look.pitch < -0.55)) {
      this.state = PlayerState.Dive;
      this.velocity.set(move.x, -1.6, move.z);
      return;
    }

    // Augen knapp über der Wasseroberfläche halten
    const wave = this.ocean.height(this.position.x, this.position.z);
    const targetY = wave + 0.25 - P.eyeHeight;
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 8);

    this.collision.move(this.position, move.clone().multiplyScalar(dt), P.radius, P.height);
  }

  // ---- Tauchen: freie 3D-Bewegung mit leichtem Auftrieb ----
  private updateDive(dt: number, keys: Set<string>): void {
    const { fwd, strafe } = this.inputAxes(keys);
    const desired = this.tmpMove.set(0, 0, 0);
    desired.addScaledVector(this.look.forward(this.tmpF), fwd);
    desired.addScaledVector(this.look.right(this.tmpR), strafe);
    if (keys.has('Space')) desired.y += 0.8;
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(P.diveSpeed);

    // träge Annäherung an die Wunschgeschwindigkeit + Auftrieb
    const blend = Math.min(1, dt * P.waterAccel);
    this.velocity.lerp(desired, blend);
    this.velocity.y += P.buoyancy * dt * (desired.lengthSq() > 0 ? 0.35 : 1);

    this.collision.move(this.position, this.velocity.clone().multiplyScalar(dt), P.radius, P.height);

    // Oberfläche durchbrochen?
    const wave = this.ocean.height(this.position.x, this.position.z);
    if (this.eyeY() > wave - 0.05) {
      this.state = PlayerState.SwimSurface;
      this.velocity.set(0, 0, 0);
    }
  }

  // ---- Leiter ----
  private updateClimb(dt: number, keys: Set<string>): void {
    const l = this.ladder;
    if (!l) {
      this.state = PlayerState.SwimSurface;
      return;
    }
    this.position.x = l.standX;
    this.position.z = l.standZ;

    if (keys.has('KeyW')) this.position.y += P.climbSpeed * dt;
    if (keys.has('KeyS')) this.position.y -= P.climbSpeed * dt;

    if (this.position.y >= l.topY) {
      this.position.copy(l.topExit);
      this.state = PlayerState.Walk;
      this.velocity.set(0, 0, 0);
      this.ladder = null;
    } else if (this.position.y <= l.bottomY) {
      this.state = l.bottomState === 'swim' ? PlayerState.SwimSurface : PlayerState.Walk;
      this.velocity.set(0, 0, 0);
      this.ladder = null;
    }
  }

  // ---- Gehen an Deck / in Räumen ----
  private updateWalk(dt: number, keys: Set<string>): void {
    const { fwd, strafe } = this.inputAxes(keys);
    const move = this.tmpMove.set(0, 0, 0);
    move.addScaledVector(this.look.horizForward(this.tmpF), fwd);
    move.addScaledVector(this.look.right(this.tmpR), strafe);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(P.walkSpeed);

    if (this.grounded && keys.has('Space')) {
      this.velocity.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= P.gravity * dt;

    const delta = move.multiplyScalar(dt);
    delta.y = this.velocity.y * dt;
    const result = this.collision.move(this.position, delta, P.radius, P.height);
    if (result.grounded) {
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (result.hitHead && this.velocity.y > 0) this.velocity.y = 0;

    // Ins Wasser gefallen?
    const wave = this.ocean.height(this.position.x, this.position.z);
    if (!this.grounded && this.position.y + 0.4 < wave) {
      this.state = this.velocity.y < -6 ? PlayerState.Dive : PlayerState.SwimSurface;
      this.velocity.multiplyScalar(0.2);
    }
  }

  private clampToBounds(): void {
    const b = CONFIG.world.bounds;
    this.position.x = Math.max(b.minX, Math.min(b.maxX, this.position.x));
    this.position.z = Math.max(b.minZ, Math.min(b.maxZ, this.position.z));
    this.position.y = Math.max(b.minY, this.position.y);
  }
}
