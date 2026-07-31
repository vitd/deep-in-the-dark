import { CONFIG } from '../config';
import { ItemId, makeItemIcon } from './Inventory';
import { UI } from '../ui/UIManager';

// Schnellinventar (Hotbar): 6 Slots am unteren Bildschirmrand, immer
// sichtbar. Items werden im Inventar-Overlay per Klick hierher verschoben
// und zurück. Die Tasten 1-6 (bzw. Antippen auf Touch) benutzen den Slot:
// Essbares wird gegessen, alles andere nur ausgewählt (für spätere
// Werkzeuge wie den Hammer).

export const HOTBAR_SLOTS = 6;

interface Slot {
  id: ItemId;
  count: number;
}

export class Hotbar {
  private readonly slots: (Slot | null)[] = new Array(HOTBAR_SLOTS).fill(null);
  selected = 0;

  // Rückgabe true = ein Exemplar wurde verbraucht (z. B. gegessen)
  onUse: ((id: ItemId) => boolean) | null = null;
  // Nach jeder Änderung (Auswahl oder Inhalt) – z. B. fürs Hand-Item
  onChanged: (() => void) | null = null;

  add(id: ItemId): boolean {
    for (const slot of this.slots) {
      if (slot && slot.id === id && slot.count < CONFIG.inventory.maxStack) {
        slot.count++;
        this.renderHUD();
        return true;
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { id, count: 1 };
        this.renderHUD();
        return true;
      }
    }
    return false;
  }

  peek(index: number): ItemId | null {
    return this.slots[index]?.id ?? null;
  }

  removeOne(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.count--;
    if (slot.count <= 0) this.slots[index] = null;
    this.renderHUD();
  }

  get selectedItem(): ItemId | null {
    return this.peek(this.selected);
  }

  // Taste 1-6 bzw. Antippen: auswählen und ggf. benutzen
  use(index: number): void {
    this.selected = index;
    const slot = this.slots[index];
    if (slot && this.onUse?.(slot.id)) {
      this.removeOne(index);
    }
    this.renderHUD();
  }

  renderHUD(): void {
    const bar = UI.hotbar;
    bar.innerHTML = '';
    this.slots.forEach((slot, i) => {
      const cell = document.createElement('div');
      cell.className = 'inv-slot hotbar-slot' + (i === this.selected ? ' selected' : '');
      const num = document.createElement('div');
      num.className = 'hotbar-num';
      num.textContent = String(i + 1);
      cell.append(num);
      if (slot) {
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(slot.count);
        cell.append(makeItemIcon(slot.id), count);
      }
      cell.addEventListener('click', () => this.use(i));
      bar.append(cell);
    });
    this.onChanged?.();
  }

  // Zeile im Inventar-Overlay: Klick nimmt das Item zurück ins Inventar
  renderOverlay(onTakeBack: (index: number) => void): void {
    const grid = UI.invHotbarGrid;
    grid.innerHTML = '';
    this.slots.forEach((slot, i) => {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (slot) {
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(slot.count);
        cell.append(makeItemIcon(slot.id), count);
        cell.classList.add('usable');
        cell.addEventListener('click', () => onTakeBack(i));
      }
      grid.append(cell);
    });
  }
}
