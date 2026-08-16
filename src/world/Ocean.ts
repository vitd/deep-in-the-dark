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

// Wassertiefe unter einem Punkt der Oberfläche, als GLSL aus den
// Seemaßen erzeugt. Gespiegelt wird nur das Basisprofil aus lake.ts
// (ebener Küstenschelf, zur Mitte parabelförmig auf centerDepth) – das
// Bodenrelief bleibt außen vor: für die Trübung zählt die Wassersäule
// im Großen, und der Shader bleibt frei von Noise.
function depthGLSL(): string {
  const L = CONFIG.world.lake;
  const coastY = CONFIG.world.seabedY;
  return `
float waterDepth(vec2 p) {
  float r = length(p - vec2(${L.center.x.toFixed(2)}, ${L.center.z.toFixed(2)}));
  float bowlR = ${(L.radius - L.shelfWidth).toFixed(2)};
  float base = ${coastY.toFixed(2)};
  if (r < bowlR) {
    float t = r / bowlR;
    base += ${(-L.centerDepth - coastY).toFixed(2)} * (1.0 - t * t);
  }
  return max(0.0, ${CONFIG.world.seaLevel.toFixed(2)} - base);
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
uniform float uClarityMax;
uniform float uMurk;
uniform float uOpaqueDepth;
varying vec3 vWorldPos;

__DEPTH__

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

  // Deckkraft von oben: der Seeboden soll nur im flachen Küstenwasser
  // durchscheinen. Beer-Lambert über die Wassersäule unter dem
  // Blickpunkt – flach einfallende Blicke laufen entsprechend länger
  // durchs Wasser und trüben schneller ein. Ab uOpaqueDepth wird die
  // Oberfläche exakt dicht, damit über der Tiefe garantiert nichts mehr
  // durchkommt. Von unten (Taucher) bleibt sie glasig wie bisher, dort
  // begrenzt ohnehin der Unterwassernebel die Sicht.
  float alpha = 0.92;
  if (gl_FrontFacing) {
    float depth = waterDepth(vWorldPos.xz);
    float path = depth / max(0.25, abs(viewDir.y));
    float clarity = uClarityMax * exp(-uMurk * path);
    clarity *= 1.0 - smoothstep(uOpaqueDepth * 0.5, uOpaqueDepth, depth);
    alpha = 1.0 - clarity;
  }

  gl_FragColor = vec4(color, alpha);
}
`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    // Deckt den ganzen See (2 km Durchmesser) ab und läuft ringsum ein
    // Stück in die Steilküste hinein. Die Vertex-Dichte ist gröber als
    // früher – die feinste Welle löst sie nicht mehr auf, was hinter
    // Nebel und Far-Plane aber nicht auffällt.
    const L = CONFIG.world.lake;
    const size = L.radius * 2 + 100;
    const geo = new THREE.PlaneGeometry(size, size, 300, 300);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT.replace('__WAVES__', waveGLSL()),
      fragmentShader: WATER_FRAG.replace('__DEPTH__', depthGLSL()),
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 1.0, 0.6).normalize() },
        uColorDeep: { value: new THREE.Color(0x14424f) },
        uColorShallow: { value: new THREE.Color(0x3f8a96) },
        uFogColor: { value: new THREE.Color(CONFIG.world.fogAbove.color) },
        uFogDensity: { value: CONFIG.world.fogAbove.density },
        uWaterTex: { value: pixelTexture('water.png') },
        uClarityMax: { value: CONFIG.world.waterClarity.max },
        uMurk: { value: CONFIG.world.waterClarity.murk },
        uOpaqueDepth: { value: CONFIG.world.waterClarity.opaqueDepth },
      },
      side: THREE.DoubleSide,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(L.center.x, CONFIG.world.seaLevel, L.center.z);
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
