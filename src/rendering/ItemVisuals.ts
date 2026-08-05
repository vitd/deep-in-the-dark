import * as THREE from 'three';
import { loadModel } from './Models';
import type { ItemId } from '../systems/Inventory';

// Gemeinsame 3D-Darstellung der Items: wird von der First-Person-Hand
// (HeldItem) und den Inventar-Icons (ItemIcons) genutzt.

const MODEL_FILES: Partial<Record<ItemId, string>> = {
  eisen: 'iron.glb',
  gold: 'gold.glb',
  fass: 'barrel.glb',
  fisch: 'fish.glb',
  grossfisch: 'fish-big.glb',
  nyzerin: 'nyzerine.glb',
  glyzerin: 'glyzerine.glb',
  telefon: 'telephone.glb',
};

// Items ohne eigenes Modell: einfacher farbiger Würfel
const BOX_COLORS: Partial<Record<ItemId, number>> = {
  stein: 0x8a8a8a,
  nahrung: 0xc8a040,
  plastik: 0xc8d4dc,
};

// Planken-Material erst nach fertig geladener Textur, damit auch die
// Icon-Renderings (einmalige Snapshots) die Textur sicher zeigen.
let plankMatPromise: Promise<THREE.MeshLambertMaterial> | null = null;

function plankMaterial(): Promise<THREE.MeshLambertMaterial> {
  if (!plankMatPromise) {
    plankMatPromise = new THREE.TextureLoader()
      .loadAsync('assets/textures/plank.png')
      .then((tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshLambertMaterial({ map: tex });
      });
  }
  return plankMatPromise;
}

function makeHammerMesh(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.045), mat);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.09, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x5a646c }),
  );
  head.position.y = 0.21;
  g.add(handle, head);
  return g;
}

function makePlankMesh(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.2), mat));
  return g;
}

// Baut die 3D-Darstellung eines Items. `modelSize` gilt nur für
// GLB-Modelle; die prozeduralen Meshes behalten ihre natürliche Größe.
export function buildItemObject(id: ItemId, modelSize: number): Promise<THREE.Object3D> {
  if (id === 'hammer') return plankMaterial().then((mat) => makeHammerMesh(mat));
  if (id === 'holzplanke') return plankMaterial().then((mat) => makePlankMesh(mat));

  const boxColor = BOX_COLORS[id];
  if (boxColor !== undefined) {
    return Promise.resolve(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshLambertMaterial({ color: boxColor }),
      ),
    );
  }

  const file = MODEL_FILES[id];
  if (!file) return Promise.reject(new Error(`Kein Modell für Item "${id}"`));
  return loadModel(file, modelSize).then(({ template }) => template.clone(true));
}
