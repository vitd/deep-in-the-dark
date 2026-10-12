import * as THREE from 'three';
import { pixelTexture } from './Textures';

// Kaustik auf dem Seeboden: das wandernde Lichtnetz der Sonne auf dem
// Grund. Es wird nicht als eigene Geometrie gezeichnet, sondern in die
// Fragment-Shader der Grundmaterialien eingehängt (`onBeforeCompile`).
// So liegt das Muster exakt auf dem (unebenen) Boden, ohne dass eine
// zweite Fläche verlegt werden muss.
//
// Ein gemeinsamer Satz Uniformen steuert Zeit und Stärke für alle
// eingehängten Materialien; `aktualisiereKaustik` wird pro Bild aus der
// Welt aufgerufen.

const uZeit = { value: 0 };
const uStaerke = { value: 0.7 };
const uTextur = { value: pixelTexture('caustic.png', 1, 1) };

const VERT_KOPF = 'varying vec3 vKausWorld;\n';
const FRAG_KOPF = /* glsl */ `uniform float uKausZeit;
uniform float uKausStaerke;
uniform sampler2D uKausTextur;
varying vec3 vKausWorld;
`;

const FRAG_EINSCHUB = /* glsl */ `
  if (uKausStaerke > 0.001) {
    vec2 cUv = vKausWorld.xz * 0.05;
    float c1 = texture2D(uKausTextur, cUv + vec2(uKausZeit * 0.010, uKausZeit * 0.007)).r;
    float c2 = texture2D(uKausTextur, cUv * 1.6 - vec2(uKausZeit * 0.008, uKausZeit * 0.012)).r;
    float c = pow(clamp((c1 + c2 * 0.8) * 0.7, 0.0, 1.0), 1.3) * uKausStaerke;
    gl_FragColor.rgb += c * vec3(0.30, 0.55, 0.60);
  }
`;

// Hängt die Kaustik in ein Lambert-Material ein (Seeboden, Felsflächen).
export function mitKaustik<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uKausZeit = uZeit;
    shader.uniforms.uKausStaerke = uStaerke;
    shader.uniforms.uKausTextur = uTextur;
    shader.vertexShader = VERT_KOPF + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vKausWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = FRAG_KOPF + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\n' + FRAG_EINSCHUB,
    );
  };
  material.needsUpdate = true;
  return material;
}

export function aktualisiereKaustik(dt: number): void {
  uZeit.value += dt;
}
