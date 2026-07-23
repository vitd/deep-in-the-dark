import * as THREE from 'three';
import { settings } from '../systems/Settings';

// Pointer-Lock-Mauskamera (Yaw/Pitch), Empfindlichkeit aus den Optionen.

const PITCH_LIMIT = Math.PI / 2 - 0.05;

export class MouseLook {
  yaw = 0;
  pitch = 0;

  private readonly onMove = (e: MouseEvent) => {
    this.applyDelta(e.movementX, e.movementY);
  };

  // Gemeinsamer Eingang für Maus- und Touch-Blicksteuerung.
  applyDelta(dx: number, dy: number): void {
    const s = 0.0022 * settings.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  attach(): void {
    document.addEventListener('mousemove', this.onMove);
  }

  detach(): void {
    document.removeEventListener('mousemove', this.onMove);
  }

  applyTo(camera: THREE.Camera, eye: THREE.Vector3): void {
    camera.position.copy(eye);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // Blickrichtung (voll 3D)
  forward(out: THREE.Vector3): THREE.Vector3 {
    out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    return out;
  }

  // Bewegungsrichtung in der Horizontalebene
  horizForward(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }
}
