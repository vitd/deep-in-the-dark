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
  // 1 = normal; < 1 bei Erschöpfung (siehe Stats)
  speedFactor = 1;
  // true, solange auf der Leiter wirklich Höhe gewonnen/verloren wird
  // (zählt für den Nahrungsverbrauch als Bewegung)
  climbMoving = false;

  private ladder: LadderDef | null = null;
  // Zuletzt verlassene Leiter: Sie greift nicht sofort wieder zu – sonst
  // klebt man am Ausstieg fest. Freigabe siehe tryGrabLadder().
  private released: LadderDef | null = null;
  // Richtung, in der sie verlassen wurde: -1 unten, +1 oben, 0 losgelassen
  private releasedDir = 0;
  private readonly tmpF = new THREE.Vector3();
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpMove = new THREE.Vector3();

  constructor(
    readonly look: MouseLook,
    private readonly collision: CollisionWorld,
    private readonly ocean: Ocean,
    private readonly ladders: readonly LadderDef[] = [],
  ) {}

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.position).setY(this.position.y + P.eyeHeight);
  }

  eyeY(): number {
    return this.position.y + P.eyeHeight;
  }

  startClimb(ladder: LadderDef): void {
    this.ladder = ladder;
    this.released = null;
    this.releasedDir = 0;
    this.state = PlayerState.Climb;
    this.velocity.set(0, 0, 0);
    this.position.x = ladder.standX;
    this.position.z = ladder.standZ;
    this.position.y = Math.max(ladder.bottomY, Math.min(this.position.y, ladder.topY - 0.2));
  }

  update(dt: number, keys: Set<string>): void {
    this.climbMoving = false;
    // Leitern greifen automatisch – aber nur aus dem Gehen/Schwimmen
    // heraus, damit ein Tauchgang neben dem Boot nicht unterbrochen wird.
    if (this.state === PlayerState.Walk || this.state === PlayerState.SwimSurface) {
      this.tryGrabLadder();
    }
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
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(P.swimSpeed * this.speedFactor);

    // Abtauchen: Taste C oder steil nach unten blicken + vorwärts.
    // Kräftiger Anfangsstoß nach unten, damit der Kopf sicher unter die
    // Wellen kommt (ohne Auftrieb gibt es keinen Gegendruck).
    if (keys.has('KeyC') || (fwd > 0 && this.look.pitch < -0.55)) {
      this.state = PlayerState.Dive;
      this.velocity.set(move.x, -P.diveSpeed, move.z);
      this.position.y -= 0.45;
      return;
    }

    // Augen knapp über der Wasseroberfläche halten
    const wave = this.ocean.height(this.position.x, this.position.z);
    const targetY = wave + 0.25 - P.eyeHeight;
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 8);

    this.collision.move(this.position, move.clone().multiplyScalar(dt), P.radius, P.height);
  }

  // ---- Tauchen: freie 3D-Bewegung, kein Auftrieb ----
  private updateDive(dt: number, keys: Set<string>): void {
    const { fwd, strafe } = this.inputAxes(keys);
    const sinking = keys.has('KeyC');
    const desired = this.tmpMove.set(0, 0, 0);
    desired.addScaledVector(this.look.forward(this.tmpF), fwd);
    desired.addScaledVector(this.look.right(this.tmpR), strafe);
    // Leertaste: aufwärts, C: abwärts – symmetrisch, damit man ohne
    // Auftrieb gezielt tiefer kommt
    if (keys.has('Space')) desired.y += 1;
    if (sinking) desired.y -= 1;
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(P.diveSpeed * this.speedFactor);

    const blend = Math.min(1, dt * P.waterAccel);
    this.velocity.lerp(desired, blend);

    this.collision.move(this.position, this.velocity.clone().multiplyScalar(dt), P.radius, P.height);

    // Auftauchen erst, wenn der Kopf wirklich über die Welle kommt – und
    // nie, solange aktiv abgetaucht wird. Sonst schnappt der Spieler
    // direkt unter der Oberfläche ständig zurück ins Oberflächenschwimmen.
    const wave = this.ocean.height(this.position.x, this.position.z);
    if (!sinking && this.eyeY() > wave + 0.1) {
      this.state = PlayerState.SwimSurface;
      this.velocity.set(0, 0, 0);
    }
  }

  // ---- Leiter ----

  // Automatisches Greifen. Zwei Fälle, damit man nicht versehentlich
  // hängen bleibt, wenn man am Fuß der Leiter nur vorbeigeht:
  // - von der Seite: nah dran und grob zur Leiter blickend
  // - von oben (Deck-/Dachkante): nah dran und nach unten blickend
  private tryGrabLadder(): void {
    const near = this.ladderInReach();
    if (near !== this.released) {
      // außer Reichweite (oder andere Leiter) – Sperre aufheben
      this.released = null;
    } else if (this.releasedDir !== 0 && Math.sign(this.climbDirection()) === -this.releasedDir) {
      // Der Blick zeigt wieder zurück auf die Leiter: Wer unten
      // abgestiegen ist und gleich wieder hochschaut, greift sofort
      // erneut zu, ohne erst weglaufen zu müssen.
      this.released = null;
    }
    if (near && !this.released) this.startClimb(near);
  }

  private ladderInReach(): LadderDef | null {
    let best: LadderDef | null = null;
    let bestDist = P.climbGrabRadius * P.climbGrabRadius;
    for (const l of this.ladders) {
      if (this.position.y < l.bottomY - 0.6 || this.position.y > l.topY + 0.4) continue;
      const dx = this.position.x - l.standX;
      const dz = this.position.z - l.standZ;
      const dist = dx * dx + dz * dz;
      if (dist > bestDist) continue;

      const atTop = this.position.y >= l.topY - 0.35;
      const fwd = this.look.horizForward(this.tmpF);
      const wants = atTop
        ? this.look.pitch <= -P.climbLookDeadzone
        : fwd.x * l.face.x + fwd.z * l.face.z >= 0.25;
      if (!wants) continue;

      bestDist = dist;
      best = l;
    }
    return best;
  }

  // Kletterrichtung allein aus der Blickneigung: leicht nach oben blicken
  // = langsam hoch, steil = volle Fahrt, waagerecht = hängen bleiben.
  // Bewusst ohne W/S-Alternative – sonst würde die gedrückte Lauftaste
  // beim Angreifen der Leiter die Blickrichtung überstimmen.
  private climbDirection(): number {
    const pitch = this.look.pitch;
    const steep = Math.abs(pitch);
    if (steep <= P.climbLookDeadzone) return 0;
    const t = Math.min(1, (steep - P.climbLookDeadzone) / (P.climbLookFull - P.climbLookDeadzone));
    return Math.sign(pitch) * (0.4 + 0.6 * t);
  }

  private leaveLadder(l: LadderDef, state: PlayerState, dir: number): void {
    this.state = state;
    this.velocity.set(0, 0, 0);
    this.ladder = null;
    this.released = l;
    this.releasedDir = dir;
  }

  private updateClimb(dt: number, keys: Set<string>): void {
    const l = this.ladder;
    if (!l) {
      this.state = PlayerState.SwimSurface;
      return;
    }
    // Leertaste: bewusst loslassen (fällt bzw. schwimmt weiter)
    if (keys.has('Space')) {
      this.leaveLadder(l, PlayerState.Walk, 0);
      return;
    }
    this.position.x = l.standX;
    this.position.z = l.standZ;

    const dir = this.climbDirection();
    this.climbMoving = dir !== 0;
    this.position.y += dir * P.climbSpeed * this.speedFactor * dt;

    if (this.position.y >= l.topY) {
      this.position.copy(l.topExit);
      this.leaveLadder(l, PlayerState.Walk, 1);
    } else if (this.position.y <= l.bottomY) {
      // Unten bleibt man auf der letzten Sprosse stehen; erst der Blick
      // nach unten steigt wirklich ab. Sonst würde man beim Greifen im
      // Wellental sofort wieder von der Leiter rutschen.
      this.position.y = l.bottomY;
      if (dir < 0) {
        const next = l.bottomState === 'swim' ? PlayerState.SwimSurface : PlayerState.Walk;
        this.leaveLadder(l, next, -1);
      }
    }
  }

  // ---- Gehen an Deck / in Räumen ----
  private updateWalk(dt: number, keys: Set<string>): void {
    const { fwd, strafe } = this.inputAxes(keys);
    const move = this.tmpMove.set(0, 0, 0);
    move.addScaledVector(this.look.horizForward(this.tmpF), fwd);
    move.addScaledVector(this.look.right(this.tmpR), strafe);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(P.walkSpeed * this.speedFactor);

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
