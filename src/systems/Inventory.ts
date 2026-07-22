import { CONFIG } from '../config';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

export type ItemId = 'holzplanke' | 'eisen';

interface Slot {
  id: ItemId;
  count: number;
}

export class Inventory {
  private readonly slots: (Slot | null)[] = new Array(CONFIG.inventory.slots).fill(null);

  // Legt ein Item ins Inventar. false, wenn kein Platz mehr ist.
  add(id: ItemId): boolean {
    // erst vorhandene Stapel auffüllen
    for (const slot of this.slots) {
      if (slot && slot.id === id && slot.count < CONFIG.inventory.maxStack) {
        slot.count++;
        this.renderUI();
        return true;
      }
    }
    // dann einen freien Slot belegen
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { id, count: 1 };
        this.renderUI();
        return true;
      }
    }
    return false;
  }

  count(id: ItemId): number {
    return this.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }

  renderUI(): void {
    const grid = UI.inventoryGrid;
    grid.innerHTML = '';
    for (const slot of this.slots) {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (slot) {
        const icon = document.createElement('div');
        icon.className = `inv-icon ${slot.id}`;
        icon.textContent = slot.id === 'holzplanke' ? 'H' : 'Fe';
        icon.title = STR.itemNames[slot.id];
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(slot.count);
        cell.append(icon, count);
      }
      grid.append(cell);
    }
  }
}
