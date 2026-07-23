import * as THREE from 'three';
import { CONFIG } from '../config';
import { InteractionSystem, Interactable } from '../systems/Interaction';
import { Inventory, ItemId } from '../systems/Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { Ocean } from './Ocean';
import { texturedMat } from '../rendering/Textures';

// Aufsammelbare Ressourcen: Holzplanken treiben auf den Wellen,
// Eisenbrocken liegen am Meeresboden nahe der Klippen.

const plankMat = texturedMat('plank.png', 1, 1);
const ironMat = new THREE.MeshLambertMaterial({ color: 0x3e4448 });

const PLANK_SPOTS = [
  { x: -35, z: 3 }, { x: -33, z: 9 }, { x: -38, z: 12 },
  { x: -31, z: -4 }, { x: -40, z: 2 }, { x: -36, z: 16 },
];

const IRON_SPOTS = [
  { x: -50, z: -6 }, { x: -47, z: 3 }, { x: -51, z: 11 },
  { x: -45, z: -14 }, { x: -49, z: 18 },
];

interface FloatingItem {
  mesh: THREE.Mesh;
  phase: number;
}

export class Resources {
  private readonly planks: FloatingItem[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ocean: Ocean,
    interaction: InteractionSystem,
    inventory: Inventory,
  ) {
    for (const [i, spot] of PLANK_SPOTS.entries()) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.45), plankMat);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = i * 1.3;
      scene.add(mesh);
      this.planks.push({ mesh, phase: i * 0.9 });
      this.registerPickup(interaction, inventory, mesh, 'holzplanke', () => {
        const idx = this.planks.findIndex((p) => p.mesh === mesh);
        if (idx >= 0) this.planks.splice(idx, 1);
      });
    }

    for (const [i, spot] of IRON_SPOTS.entries()) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), ironMat);
      mesh.position.set(spot.x, CONFIG.world.seabedY + 0.18, spot.z);
      mesh.rotation.y = i * 0.7;
      scene.add(mesh);
      this.registerPickup(interaction, inventory, mesh, 'eisen');
    }
  }

  private registerPickup(
    interaction: InteractionSystem,
    inventory: Inventory,
    mesh: THREE.Mesh,
    id: ItemId,
    onRemoved?: () => void,
  ): void {
    const entry: Interactable = {
      object: mesh,
      prompt: STR.pickUp,
      interact: () => {
        if (!inventory.add(id)) {
          UI.toast(STR.inventoryFull);
          return;
        }
        this.scene.remove(mesh);
        interaction.remove(entry);
        onRemoved?.();
        UI.toast(STR.pickedUp(STR.itemNames[id]));
      },
    };
    interaction.add(entry);
  }

  update(): void {
    // Planken folgen der Wellenhöhe und drehen sich träge.
    for (const p of this.planks) {
      const { x, z } = p.mesh.position;
      p.mesh.position.y = this.ocean.height(x, z) + 0.04;
      p.mesh.rotation.y += 0.0006;
      p.mesh.rotation.x = Math.sin(p.phase + p.mesh.rotation.y * 8) * 0.05;
    }
  }
}
