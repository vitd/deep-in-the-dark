import * as THREE from 'three';
import { CONFIG } from '../config';
import { BoatFrame } from './BoatFrame';

// Fahrlogik des Boots. Gefahren wird nur, solange der Spieler am
// Steuerstand steht (siehe PlayState): W/S bewegen den Fahrhebel
// (vorwärts/rückwärts), A/D drehen das Steuerrad. Hebel und Rad
// behalten ihre Stellung – wie an einem echten Steuerstand.

const B = CONFIG.boot;

export interface HelmVisuals {
  // dreht sich mit dem Rad-Einschlag (um die Blickachse)
  wheelSpin: THREE.Object3D;
  // kippt mit dem Fahrhebel vor/zurück
  leverArm: THREE.Object3D;
}

export class BoatController {
  // Hebel- und Radstellung, jeweils -1..1
  throttle = 0;
  wheel = 0;
  speed = 0;

  constructor(
    readonly frame: BoatFrame,
    private readonly pivot: THREE.Group,
    private readonly visuals: HelmVisuals,
  ) {}

  get isMoving(): boolean {
    return Math.abs(this.speed) > 0.05;
  }

  // Ein Simulationsschritt am Steuer. Liefert die Gierdrehung dieses
  // Frames, damit die Kamera des Steuermanns mitgedreht werden kann.
  drive(dt: number, keys: Set<string>): number {
    if (keys.has('KeyW')) this.throttle = Math.min(1, this.throttle + B.leverRate * dt);
    if (keys.has('KeyS')) this.throttle = Math.max(-1, this.throttle - B.leverRate * dt);
    if (keys.has('KeyA')) this.wheel = Math.min(1, this.wheel + B.wheelRate * dt);
    if (keys.has('KeyD')) this.wheel = Math.max(-1, this.wheel - B.wheelRate * dt);

    const target = this.throttle * (this.throttle >= 0 ? B.maxSpeed : B.rueckSpeed);
    this.speed += (target - this.speed) * Math.min(1, dt * B.accel);

    // Drehrate wächst mit Fahrt; bei Rückwärtsfahrt dreht das Heck
    // wie bei einem echten Boot in die Gegenrichtung
    const f = this.frame;
    const dYaw = this.wheel * B.turnRate * (this.speed / B.maxSpeed) * dt;
    f.yaw += dYaw;

    // Bug zeigt in Originalpose nach -z
    f.offset.x += -Math.sin(f.yaw) * this.speed * dt;
    f.offset.z += -Math.cos(f.yaw) * this.speed * dt;

    // Fahrbereich begrenzen (Klippen im Westen, Kartenrand sonst)
    const cx = f.center.x + f.offset.x;
    const cz = f.center.z + f.offset.z;
    const clampedX = Math.max(B.bounds.minX, Math.min(B.bounds.maxX, cx));
    const clampedZ = Math.max(B.bounds.minZ, Math.min(B.bounds.maxZ, cz));
    if (clampedX !== cx || clampedZ !== cz) {
      f.offset.x = clampedX - f.center.x;
      f.offset.z = clampedZ - f.center.z;
      this.speed = 0;
    }

    this.apply();
    return dYaw;
  }

  // Steuer losgelassen: Maschine auf Stopp, Boot hält sofort an
  // (so gibt es nie ein fahrendes Boot ohne Steuermann).
  stop(): void {
    this.throttle = 0;
    this.speed = 0;
    this.apply();
  }

  private apply(): void {
    const f = this.frame;
    this.pivot.position.set(
      f.center.x + f.offset.x,
      f.center.y + f.offset.y,
      f.center.z + f.offset.z,
    );
    this.pivot.rotation.y = f.yaw;
    this.visuals.wheelSpin.rotation.z = this.wheel * 2.4;
    this.visuals.leverArm.rotation.x = -this.throttle * 0.55;
  }
}
