import { CONFIG } from '../config';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

export type ItemId = 'holzplanke' | 'eisen' | 'fisch';

interface Slot {
  id: ItemId;
  count: number;
}

const ICON_TEXT: Record<ItemId, string> = {
  holzplanke: 'H',
  eisen: 'Fe',
  fisch: 'F',
};

export class Inventory {
  private readonly slots: (Slot | null)[] = new Array(CONFIG.inventory.slots).fill(null);

  // Wird vom Spielzustand gesetzt: Klick auf einen Slot mit diesem Item.
  onUse: ((id: ItemId) => void) | null = null;

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

  // Entfernt ein Exemplar. false, wenn keins vorhanden.
  consume(id: ItemId): boolean {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        slot.count--;
        if (slot.count <= 0) this.slots[i] = null;
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
        icon.textContent = ICON_TEXT[slot.id];
        icon.title = STR.itemNames[slot.id];
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(slot.count);
        cell.append(icon, count);
        const id = slot.id;
        cell.classList.add('usable');
        cell.addEventListener('click', () => this.onUse?.(id));
      }
      grid.append(cell);
    }
  }
}
