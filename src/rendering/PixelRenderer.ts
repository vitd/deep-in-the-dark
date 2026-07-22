import * as THREE from 'three';
import { CONFIG } from '../config';

// Rendert die Szene in ein niedrig aufgelöstes RenderTarget und skaliert
// es nearest-neighbor auf die Canvas-Größe hoch (mit Letterbox bei
// abweichendem Seitenverhältnis). Optional: Posterisierung + Dithering.

const UPSCALE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const UPSCALE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uScale;      // Quad-Skalierung für Letterbox
uniform float uLevels;    // Posterisierungs-Stufen (0 = aus)
uniform float uDither;    // 1 = Bayer-Dithering an
varying vec2 vUv;

float bayer4(vec2 p) {
  // 4x4-Bayer-Matrix, Werte 0..15
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = y * 4 + x;
  int m[16];
  m[0]=0; m[1]=8; m[2]=2; m[3]=10;
  m[4]=12; m[5]=4; m[6]=14; m[7]=6;
  m[8]=3; m[9]=11; m[10]=1; m[11]=9;
  m[12]=15; m[13]=7; m[14]=13; m[15]=5;
  for (int i = 0; i < 16; i++) {
    if (i == idx) return float(m[i]) / 16.0;
  }
  return 0.0;
}

void main() {
  // Letterbox: außerhalb des skalierten Bereichs schwarz
  vec2 centered = (vUv - 0.5) / uScale + 0.5;
  if (centered.x < 0.0 || centered.x > 1.0 || centered.y < 0.0 || centered.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 color = texture2D(tDiffuse, centered).rgb;

  if (uLevels > 0.5) {
    float d = 0.0;
    if (uDither > 0.5) {
      d = (bayer4(gl_FragCoord.xy) - 0.5) / uLevels;
    }
    color = floor((color + d) * uLevels + 0.5) / uLevels;
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blitMaterial: THREE.ShaderMaterial;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);

    this.target = new THREE.WebGLRenderTarget(CONFIG.render.width, CONFIG.render.height, {
      depthBuffer: true,
    });
    this.target.texture.magFilter = THREE.NearestFilter;
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.generateMipmaps = false;

    this.blitMaterial = new THREE.ShaderMaterial({
      vertexShader: UPSCALE_VERT,
      fragmentShader: UPSCALE_FRAG,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uScale: { value: new THREE.Vector2(1, 1) },
        uLevels: { value: CONFIG.render.posterizeLevels },
        uDither: { value: CONFIG.render.dither ? 1 : 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial);
    quad.frustumCulled = false;
    this.blitScene.add(quad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);

    // Seitenverhältnis der internen Auflösung beibehalten (Letterbox).
    const targetAspect = CONFIG.render.width / CONFIG.render.height;
    const windowAspect = w / h;
    const scale = this.blitMaterial.uniforms.uScale.value as THREE.Vector2;
    if (windowAspect > targetAspect) {
      scale.set(targetAspect / windowAspect, 1);
    } else {
      scale.set(1, windowAspect / targetAspect);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  clear(): void {
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000);
    this.renderer.clear();
  }
}
