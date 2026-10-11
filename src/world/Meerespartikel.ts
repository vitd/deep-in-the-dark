import * as THREE from 'three';

// Schwebeteilchen unter Wasser ("Marine Snow"): kleine, langsam
// aufsteigende Partikel, die den Tauchraum füllen und die Tiefe
// spürbar machen. Sie folgen dem Spieler in einem festen Würfel, damit
// die Dichte überall gleich bleibt und nie "Löcher" entstehen.
//
// Farbwelt und Deckkraft folgen der Art-Bible (kühles Wasserlicht).

export class Meerespartikel {
  readonly points: THREE.Points;
  private readonly positionen: Float32Array;
  private readonly geschwind: Float32Array;
  private readonly anzahl = 520;
  private readonly kante = 46;

  constructor() {
    this.positionen = new Float32Array(this.anzahl * 3);
    this.geschwind = new Float32Array(this.anzahl * 3);
    for (let i = 0; i < this.anzahl; i++) {
      this.positionen[i * 3] = (Math.random() - 0.5) * this.kante;
      this.positionen[i * 3 + 1] = (Math.random() - 0.5) * this.kante;
      this.positionen[i * 3 + 2] = (Math.random() - 0.5) * this.kante;
      this.geschwind[i * 3] = (Math.random() - 0.5) * 0.05;
      this.geschwind[i * 3 + 1] = 0.06 + Math.random() * 0.14;
      this.geschwind[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positionen, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfeef2,
      size: 0.07,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(dt: number, anker: THREE.Vector3, unterwasser: boolean): void {
    this.points.visible = unterwasser;
    if (!unterwasser || dt <= 0) return;
    this.points.position.copy(anker);
    const h = this.kante / 2;
    const p = this.positionen;
    const g = this.geschwind;
    for (let i = 0; i < this.anzahl; i++) {
      const i3 = i * 3;
      p[i3] += g[i3] * dt;
      p[i3 + 1] += g[i3 + 1] * dt;
      p[i3 + 2] += g[i3 + 2] * dt;
      if (p[i3] > h) p[i3] -= this.kante;
      else if (p[i3] < -h) p[i3] += this.kante;
      if (p[i3 + 1] > h) p[i3 + 1] -= this.kante;
      if (p[i3 + 2] > h) p[i3 + 2] -= this.kante;
      else if (p[i3 + 2] < -h) p[i3 + 2] += this.kante;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
