import * as THREE from 'three';
import { loadModel } from '../rendering/Models';
import { texturedMat } from '../rendering/Textures';
import { ItemId } from '../systems/Inventory';

// First-Person-Hand: zeigt das im Schnellinventar ausgewählte Item
// unten rechts im Blickfeld. Der Hammer hat eine Schlag-Animation.

const MODEL_FILES: Partial<Record<ItemId, string>> = {
  eisen: 'iron.glb',
  gold: 'gold.glb',
  fass: 'barrel.glb',
  fisch: 'fish.glb',
  grossfisch: 'fish-big.glb',
};

function makeHammerMesh(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.42, 0.045),
    texturedMat('plank.png', 1, 1),
  );
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.09, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x5a646c }),
  );
  head.position.y = 0.21;
  g.add(handle, head);
  return g;
}

function makePlankMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.2), texturedMat('plank.png', 1, 1)));
  return g;
}

export class HeldItem {
  private readonly anchor = new THREE.Group();
  private current: ItemId | null = null;
  private swingT = 0;

  constructor(camera: THREE.Camera) {
    // Position unten rechts im Blickfeld
    this.anchor.position.set(0.38, -0.32, -0.6);
    this.anchor.rotation.set(0.15, -0.35, 0);
    camera.add(this.anchor);
  }

  setItem(id: ItemId | null): void {
    if (id === this.current) return;
    this.current = id;
    this.anchor.clear();
    if (!id) return;

    if (id === 'hammer') {
      this.anchor.add(makeHammerMesh());
    } else if (id === 'holzplanke') {
      this.anchor.add(makePlankMesh());
    } else {
      const file = MODEL_FILES[id];
      if (!file) return;
      const wanted = id;
      loadModel(file, 0.35)
        .then(({ template }) => {
          if (this.current === wanted) this.anchor.add(template.clone(true));
        })
        .catch(() => {});
    }
  }

  swing(): void {
    this.swingT = 0.32;
  }

  get isSwinging(): boolean {
    return this.swingT > 0;
  }

  update(dt: number): void {
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      // schneller Hieb nach vorn-unten und zurück
      const t = 1 - this.swingT / 0.32; // 0..1
      const arc = Math.sin(t * Math.PI);
      this.anchor.rotation.x = 0.15 - arc * 1.2;
      this.anchor.position.z = -0.6 - arc * 0.25;
    } else {
      this.anchor.rotation.x = 0.15;
      this.anchor.position.z = -0.6;
    }
  }
}
