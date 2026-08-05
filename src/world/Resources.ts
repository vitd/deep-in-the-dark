import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { texturedMat } from '../rendering/Textures';
import { InteractionSystem, Interactable } from '../systems/Interaction';
import { Inventory, ItemId } from '../systems/Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { Ocean } from './Ocean';

// Aufsammelbare Ressourcen (Taste E):
// - Holzplanken treiben auf den Wellen
// - Eisen und Gold liegen am Meeresboden (Gold seltener, nahe der Klippen)
// - Fässer: 2 an Deck, einige treiben im Wasser, einige am Meeresboden

const plankMat = texturedMat('plank.png', 1, 1);
const ironFallbackMat = new THREE.MeshLambertMaterial({ color: 0x3e4448 });

const PLANK_SPOTS = [
  { x: -35, z: 3 }, { x: -33, z: 9 }, { x: -38, z: 12 },
  { x: -31, z: -4 }, { x: -40, z: 2 }, { x: -36, z: 16 },
];

const IRON_SPOTS = [
  { x: -50, z: -6 }, { x: -47, z: 3 }, { x: -51, z: 11 },
  { x: -45, z: -14 }, { x: -49, z: 18 },
];

const GOLD_SPOTS = [
  { x: -52, z: -18 }, { x: -46, z: 24 }, { x: -51.5, z: 5 },
];

// Fässer: Weltkoordinaten. Deck-Fässer stehen auf dem Boot
// (Boot bei x -28, Deck y 1.5).
const BARREL_DECK = [
  { x: -29.8, y: 1.85, z: 10.9 },
  { x: -25.6, y: 1.85, z: 10.2 },
];
const BARREL_FLOAT = [
  { x: -34, z: -8 }, { x: -42, z: 8 }, { x: -37, z: 20 },
];
const BARREL_SEABED = [
  { x: -49, z: 8 }, { x: -43, z: -20 }, { x: -30, z: 28 },
];

// Treibstofffässer: selten, weit draußen bzw. tief
const FUEL_BARREL_SEABED = [
  { x: -52, z: -32 }, { x: -36, z: 42 },
];
const FUEL_BARREL_FLOAT = [
  { x: -44, z: -30 },
];

interface FloatingItem {
  obj: THREE.Object3D;
  phase: number;
}

export class Resources {
  private readonly floaters: FloatingItem[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ocean: Ocean,
    private readonly interaction: InteractionSystem,
    private readonly inventory: Inventory,
    private readonly onFuelFound: (liter: number) => void,
  ) {
    // Holzplanken (einfache Boxen mit Planken-Textur, treiben)
    for (const [i, spot] of PLANK_SPOTS.entries()) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.45), plankMat);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = i * 1.3;
      scene.add(mesh);
      this.floaters.push({ obj: mesh, phase: i * 0.9 });
      this.registerPickup(mesh, 'holzplanke');
    }

    // Eisen am Meeresboden (GLB-Modell, Fallback: dunkle Box)
    for (const [i, spot] of IRON_SPOTS.entries()) {
      this.spawnModelPickup('iron.glb', 0.5, 'eisen', spot.x, CONFIG.world.seabedY + 0.25, spot.z, i * 0.7);
    }

    // Gold am Meeresboden – seltener, nahe der Klippen
    for (const [i, spot] of GOLD_SPOTS.entries()) {
      this.spawnModelPickup('gold.glb', 0.45, 'gold', spot.x, CONFIG.world.seabedY + 0.22, spot.z, i * 1.1);
    }

    // Fässer: Deck, treibend, Meeresboden
    for (const [i, spot] of BARREL_DECK.entries()) {
      this.spawnModelPickup('barrel.glb', 0.7, 'fass', spot.x, spot.y, spot.z, i * 0.8);
    }
    for (const [i, spot] of BARREL_FLOAT.entries()) {
      const group = this.spawnModelPickup('barrel.glb', 0.7, 'fass', spot.x, 0, spot.z, i * 2.1);
      group.rotation.x = Math.PI / 2 - 0.1; // treibende Fässer liegen auf der Seite
      this.floaters.push({ obj: group, phase: i * 1.7 });
    }
    for (const [i, spot] of BARREL_SEABED.entries()) {
      const group = this.spawnModelPickup(
        'barrel.glb', 0.7, 'fass', spot.x, CONFIG.world.seabedY + 0.3, spot.z, i * 2.6,
      );
      group.rotation.x = i % 2 === 0 ? Math.PI / 2 - 0.2 : 0; // teils umgekippt
    }

    // Treibstofffässer: beim Aufsammeln wird die zufällige Füllung
    // (0..max Liter) dem Vorrat gutgeschrieben, das leere Fass bleibt
    // als normales Fass-Item (zerlegbar an der Werkbank)
    for (const [i, spot] of FUEL_BARREL_SEABED.entries()) {
      this.spawnFuelBarrel(spot.x, CONFIG.world.seabedY + 0.35, spot.z, i * 1.9);
    }
    for (const [i, spot] of FUEL_BARREL_FLOAT.entries()) {
      const group = this.spawnFuelBarrel(spot.x, 0, spot.z, i * 0.7);
      group.rotation.x = Math.PI / 2 - 0.1;
      this.floaters.push({ obj: group, phase: 2.2 });
    }
  }

  private spawnFuelBarrel(x: number, y: number, z: number, yaw: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    loadModel('barrel-fuel.glb', 0.75)
      .then(({ template }) => {
        if (group.parent) group.add(template.clone(true));
      })
      .catch(() => {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.75, 0.6),
          new THREE.MeshLambertMaterial({ color: 0x8a2a20 }),
        );
        if (group.parent) group.add(box);
      });
    const entry: Interactable = {
      object: group,
      prompt: STR.pickUp,
      interact: () => {
        if (!this.inventory.pickup('fass')) {
          UI.toast(STR.inventoryFull);
          return;
        }
        this.scene.remove(group);
        this.interaction.remove(entry);
        const idx = this.floaters.findIndex((f) => f.obj === group);
        if (idx >= 0) this.floaters.splice(idx, 1);
        const liter = Math.floor(Math.random() * (CONFIG.barrels.fuelMaxLiter + 1));
        this.onFuelFound(liter);
      },
    };
    this.interaction.add(entry);
    return group;
  }

  // Erzeugt eine leere Gruppe an der Zielposition, registriert sie als
  // Pickup und füllt sie asynchron mit dem GLB-Modell (Fallback: Box).
  private spawnModelPickup(
    file: string,
    size: number,
    id: ItemId,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    loadModel(file, size)
      .then(({ template }) => {
        if (group.parent) group.add(template.clone(true));
      })
      .catch(() => {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(size, size * 0.75, size * 0.85),
          ironFallbackMat,
        );
        if (group.parent) group.add(box);
      });
    this.registerPickup(group, id);
    return group;
  }

  private registerPickup(obj: THREE.Object3D, id: ItemId): void {
    const entry: Interactable = {
      object: obj,
      prompt: STR.pickUp,
      interact: () => {
        if (!this.inventory.pickup(id)) {
          UI.toast(STR.inventoryFull);
          return;
        }
        this.scene.remove(obj);
        this.interaction.remove(entry);
        const idx = this.floaters.findIndex((f) => f.obj === obj);
        if (idx >= 0) this.floaters.splice(idx, 1);
        UI.toast(STR.pickedUp(STR.itemNames[id]));
      },
    };
    this.interaction.add(entry);
  }

  update(): void {
    // Treibende Objekte folgen der Wellenhöhe und drehen sich träge.
    for (const f of this.floaters) {
      const { x, z } = f.obj.position;
      f.obj.position.y = this.ocean.height(x, z) + 0.04;
      f.obj.rotation.y += 0.0006;
      f.phase += 0.0006;
    }
  }
}
