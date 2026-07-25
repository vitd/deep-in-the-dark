import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Zentraler Loader für GLB-Modelle aus public/assets/models/.
// Normalisiert jedes Modell: zentriert, auf Zielgröße skaliert,
// Texturen nearest-gefiltert (Pixel-Look). Ergebnisse werden gecacht
// und pro Verwendung geklont.

export interface LoadedModel {
  template: THREE.Group;
  clips: THREE.AnimationClip[];
}

const cache = new Map<string, Promise<LoadedModel>>();
const loader = new GLTFLoader();

export function loadModel(file: string, targetSize: number): Promise<LoadedModel> {
  const key = `${file}@${targetSize}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      loader.load(
        `assets/models/${file}`,
        (gltf) => {
          const inner = gltf.scene;
          inner.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              if (std.map) {
                std.map.magFilter = THREE.NearestFilter;
                std.map.minFilter = THREE.NearestFilter;
                std.map.needsUpdate = true;
              }
            }
          });
          const box = new THREE.Box3().setFromObject(inner);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          inner.position.sub(center);
          const template = new THREE.Group();
          template.add(inner);
          template.scale.setScalar(targetSize / Math.max(size.x, size.y, size.z, 0.0001));
          resolve({ template, clips: gltf.animations });
        },
        undefined,
        (err) => reject(err),
      );
    });
    cache.set(key, promise);
  }
  return promise;
}
