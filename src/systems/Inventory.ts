import { CONFIG } from '../config';
import { itemIconUrl } from '../rendering/ItemIcons';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

export type ItemId =
  | 'holzplanke'
  | 'eisen'
  | 'fisch'
  | 'grossfisch'
  | 'gold'
  | 'fass'
  | 'hammer'
  | 'nyzerin'
  | 'glyzerin'
  | 'stein'
  | 'nahrung'
  | 'plastik'
  | 'telefon';

interface Slot {
  id: ItemId;
  count: number;
}

// Buchstaben-Fallback, falls das 3D-Icon nicht gerendert werden kann
const ICON_TEXT: Record<ItemId, string> = {
  holzplanke: 'H',
  eisen: 'Fe',
  fisch: 'F',
  grossfisch: 'GF',
  gold: 'Au',
  fass: 'FS',
  hammer: 'Hm',
  nyzerin: 'Ny',
  glyzerin: 'Gl',
  stein: 'St',
  nahrung: 'Na',
  plastik: 'Pl',
  telefon: 'Te',
};

// Baut das Icon-Element eines Items (auch vom Crafting-Panel genutzt):
// ein offscreen gerendertes Thumbnail des 3D-Modells; solange das noch
// nicht bereit ist (bzw. bei Fehlern) der Buchstaben-Platzhalter.
export function makeItemIcon(id: ItemId): HTMLElement {
  const icon = document.createElement('div');
  icon.className = `inv-icon ${id}`;
  icon.title = STR.itemNames[id];
  icon.textContent = ICON_TEXT[id];
  itemIconUrl(id).then((url) => {
    if (!url) return;
    icon.textContent = '';
    icon.classList.add('has-image');
    const img = document.createElement('img');
    img.src = url;
    img.alt = STR.itemNames[id];
    img.draggable = false;
    icon.append(img);
  });
  return icon;
}

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
    this.renderInto(UI.inventoryGrid, (id) => this.onUse?.(id));
  }

  // Rendert die Slots in ein beliebiges Grid (Inventar-Overlay oder
  // Crafting-Panel) mit eigenem Klick-Verhalten.
  renderInto(grid: HTMLElement, onClick: (id: ItemId) => void): void {
    grid.innerHTML = '';
    for (const slot of this.slots) {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (slot) {
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(slot.count);
        cell.append(makeItemIcon(slot.id), count);
        const id = slot.id;
        cell.classList.add('usable');
        cell.addEventListener('click', () => onClick(id));
      }
      grid.append(cell);
    }
  }
}
