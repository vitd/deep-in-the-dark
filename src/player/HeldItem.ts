import * as THREE from 'three';
import { buildItemObject } from '../rendering/ItemVisuals';
import { ItemId } from '../systems/Inventory';

// First-Person-Hand: zeigt das im Schnellinventar ausgewählte Item
// unten rechts im Blickfeld. Der Hammer hat eine Schlag-Animation.

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

    buildItemObject(id, 0.35)
      .then((obj) => {
        if (this.current === id) this.anchor.add(obj);
      })
      .catch(() => {});
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
