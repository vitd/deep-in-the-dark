import * as THREE from 'three';

// Bezugsrahmen des fahrenden Boots. Die gesamte Boot-Geometrie, ihre
// Kollisionsboxen und die Leitern sind in "Originalkoordinaten"
// definiert (Weltkoordinaten der Startpose). Sobald das Boot fährt,
// bildet dieser Frame sie auf die aktuelle Pose ab: Verschiebung
// `offset` plus Gierdrehung `yaw` um das Bootszentrum. So bleibt die
// achsenparallele AABB-Kollision intakt – der Spieler wird zum Prüfen
// einfach in den Boots-Rahmen zurückgerechnet.

export class BoatFrame {
  readonly center: THREE.Vector3;
  readonly offset = new THREE.Vector3();
  yaw = 0;

  constructor(center: THREE.Vector3) {
    this.center = center.clone();
  }

  get moved(): boolean {
    return this.yaw !== 0 || this.offset.lengthSq() > 0;
  }

  // Originalkoordinaten -> aktuelle Weltkoordinaten (in place)
  toWorld(p: THREE.Vector3): THREE.Vector3 {
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    p.x = this.center.x + this.offset.x + dx * cos + dz * sin;
    p.z = this.center.z + this.offset.z - dx * sin + dz * cos;
    p.y += this.offset.y;
    return p;
  }

  // aktuelle Weltkoordinaten -> Originalkoordinaten (in place)
  toLocal(p: THREE.Vector3): THREE.Vector3 {
    const dx = p.x - this.center.x - this.offset.x;
    const dz = p.z - this.center.z - this.offset.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Drehung um -yaw
    p.x = this.center.x + dx * cos - dz * sin;
    p.z = this.center.z + dx * sin + dz * cos;
    p.y -= this.offset.y;
    return p;
  }

  // Nur die Richtung drehen (Bewegungsdeltas, Blick-/face-Vektoren)
  rotateDir(v: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const x = v.x * cos + v.z * sin;
    v.z = -v.x * sin + v.z * cos;
    v.x = x;
    return v;
  }

  rotateDirInverse(v: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const x = v.x * cos - v.z * sin;
    v.z = v.x * sin + v.z * cos;
    v.x = x;
    return v;
  }
}
