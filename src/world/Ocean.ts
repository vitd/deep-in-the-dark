import * as THREE from 'three';
import { CONFIG } from '../config';
import { pixelTexture } from '../rendering/Textures';

// Animierte Wasserfläche. Die Wellenfunktion existiert zweimal mit
// identischer Mathematik: einmal im Vertex-Shader (GPU) und einmal in
// height() (CPU) – für Schwimmhöhe des Spielers und treibende Planken.

function waveGLSL(): string {
  const terms = CONFIG.waves
    .map(
      (w) =>
        `h += ${w.amp.toFixed(4)} * sin(dot(vec2(${w.dirX.toFixed(3)}, ${w.dirZ.toFixed(
          3,
        )}), p) * ${w.freq.toFixed(4)} + t * ${w.speed.toFixed(4)});`,
    )
    .join('\n  ');
  return `
float waveHeight(vec2 p, float t) {
  float h = 0.0;
  ${terms}
  return h;
}`;
}

const WATER_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;

__WAVES__

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += waveHeight(wp.xz, uTime);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform sampler2D uWaterTex;
uniform float uTime;
varying vec3 vWorldPos;

void main() {
  vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (!gl_FrontFacing) n = -n;

  float light = clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
  // Retro-Look: Beleuchtung in wenige Bänder posterisieren
  light = floor(light * 4.0) / 4.0;

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 2.0);
  fresnel = floor(fresnel * 3.0) / 3.0;

  vec3 color = mix(uColorDeep, uColorShallow, light * 0.7 + fresnel * 0.3);

  // Wasser-Textur des Kunden: treibt langsam mit zwei überlagerten
  // Richtungen, damit die Kachelung nicht auffällt
  vec2 uv1 = vWorldPos.xz * 0.12 + vec2(uTime * 0.015, uTime * 0.009);
  vec2 uv2 = vWorldPos.xz * 0.055 - vec2(uTime * 0.007, uTime * 0.011);
  vec3 tex = mix(texture2D(uWaterTex, uv1).rgb, texture2D(uWaterTex, uv2).rgb, 0.5);
  color = mix(color, tex * (0.55 + light * 0.6), 0.5);
  if (!gl_FrontFacing) {
    // Unterseite der Wasseroberfläche: heller, glasiger
    color = mix(color, vec3(0.55, 0.8, 0.85), 0.35);
  }

  float dist = length(cameraPosition - vWorldPos);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(color, 0.92);
}
`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    const geo = new THREE.PlaneGeometry(420, 420, 110, 110);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT.replace('__WAVES__', waveGLSL()),
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 1.0, 0.6).normalize() },
        uColorDeep: { value: new THREE.Color(0x14424f) },
        uColorShallow: { value: new THREE.Color(0x3f8a96) },
        uFogColor: { value: new THREE.Color(CONFIG.world.fogAbove.color) },
        uFogDensity: { value: CONFIG.world.fogAbove.density },
        uWaterTex: { value: pixelTexture('wasser.png') },
      },
      side: THREE.DoubleSide,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(-15, CONFIG.world.seaLevel, 0);
    this.mesh.frustumCulled = false;
  }

  // CPU-Spiegel der Shader-Wellenfunktion (Weltkoordinaten).
  height(x: number, z: number): number {
    let h = CONFIG.world.seaLevel;
    for (const w of CONFIG.waves) {
      h += w.amp * Math.sin((w.dirX * x + w.dirZ * z) * w.freq + this.time * w.speed);
    }
    return h;
  }

  update(dt: number, fogColor: THREE.Color, fogDensity: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    (this.material.uniforms.uFogColor.value as THREE.Color).copy(fogColor);
    this.material.uniforms.uFogDensity.value = fogDensity;
  }
}
