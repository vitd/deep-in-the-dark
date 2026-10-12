import * as THREE from 'three';
import { CONFIG } from '../config';
import { PALETTE } from '../rendering/Palette';

// Lichtschächte unter Wasser ("God Rays"): schmale, additive Flächen,
// die von der Wasseroberfläche herabhängen. Sie folgen dem Spieler in
// der Fläche (x/z), hängen aber fest an der Oberfläche – tief getaucht
// verschwinden sie im Nebel, flach getaucht gliedern sie das Wasser.
//
// Stilisiert und ruhig: additiv, schwach, langsam driftend. Farbe und
// Zurückhaltung folgen der Art-Bible.

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS = /* glsl */ `
uniform float uZeit;
uniform vec3 uFarbe;
uniform float uStaerke;
varying vec2 vUv;
void main() {
  // weiche Längskanten, Abfall nach unten
  float kante = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  float hoch = pow(clamp(vUv.y, 0.0, 1.0), 1.7);
  float flackern = 0.7 + 0.3 * sin(uZeit * 0.6 + vUv.y * 4.0);
  gl_FragColor = vec4(uFarbe, kante * hoch * flackern * uStaerke);
}
`;

export class Lichtschacht {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly anzahl = 9;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uZeit: { value: 0 },
        uFarbe: { value: new THREE.Color(PALETTE.unterwasserLicht) },
        uStaerke: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    for (let i = 0; i < this.anzahl; i++) {
      const breite = 3.5 + (i % 3) * 1.6;
      const wand = new THREE.Mesh(new THREE.PlaneGeometry(breite, 80), this.mat);
      const a = (i / this.anzahl) * Math.PI * 2 + 0.4;
      const r = 5 + (i % 4) * 2.4;
      wand.position.set(Math.cos(a) * r, -40, Math.sin(a) * r);
      wand.rotation.set(0.18 * (i % 2 ? 1 : -1), -a + Math.PI / 2, 0);
      this.group.add(wand);
    }
    this.group.visible = false;
  }

  update(dt: number, auge: THREE.Vector3, unterwasser: boolean): void {
    this.group.visible = unterwasser;
    this.mat.uniforms.uStaerke.value = unterwasser ? 0.16 : 0;
    if (!unterwasser) return;
    this.mat.uniforms.uZeit.value += dt;
    // an der Oberfläche verankert, dem Spieler in der Fläche folgen
    this.group.position.set(auge.x, CONFIG.world.seaLevel, auge.z);
    this.group.rotation.y += dt * 0.02;
  }
}
