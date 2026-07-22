import * as THREE from 'three';
import { CONFIG } from '../config';

// Raycast aus der Bildmitte gegen registrierte Interactables.
// Zeigt Prompts ("E: Aufheben", "Versperrt", ...) und führt bei E aus.

export interface Interactable {
  object: THREE.Object3D;
  prompt: string | (() => string);
  interact?: () => void;
  maxDistance?: number;
}

export class InteractionSystem {
  private readonly list: Interactable[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly center = new THREE.Vector2(0, 0);
  current: Interactable | null = null;

  add(i: Interactable): void {
    this.list.push(i);
  }

  remove(i: Interactable): void {
    const idx = this.list.indexOf(i);
    if (idx >= 0) this.list.splice(idx, 1);
    if (this.current === i) this.current = null;
  }

  clear(): void {
    this.list.length = 0;
    this.current = null;
  }

  update(camera: THREE.Camera): void {
    this.raycaster.setFromCamera(this.center, camera);
    this.raycaster.far = CONFIG.interact.maxDistance + 2;

    const objects = this.list.map((i) => i.object);
    const hits = this.raycaster.intersectObjects(objects, true);

    this.current = null;
    for (const hit of hits) {
      const entry = this.findEntry(hit.object);
      if (!entry) continue;
      const maxDist = entry.maxDistance ?? CONFIG.interact.maxDistance;
      if (hit.distance <= maxDist) this.current = entry;
      break; // nur der vorderste Treffer zählt
    }
  }

  promptText(): string | null {
    if (!this.current) return null;
    const p = this.current.prompt;
    return typeof p === 'function' ? p() : p;
  }

  interact(): void {
    this.current?.interact?.();
  }

  private findEntry(obj: THREE.Object3D): Interactable | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const found = this.list.find((i) => i.object === o);
      if (found) return found;
      o = o.parent;
    }
    return null;
  }
}
