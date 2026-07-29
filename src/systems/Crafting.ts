import { Inventory, ItemId, makeItemIcon } from './Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

// Werkbank (Crafting-Tisch in der Kajüte): 3x3-Feld wie in Minecraft.
// Per Klick wandern Items aus dem Inventar in freie Felder und zurück.
// Passt die Belegung zu einem Rezept, erscheint das Ergebnis; ein Klick
// darauf verbraucht die Zutaten. Die Rezepte sind formunabhängig
// (nur die Anzahl zählt, nicht die Anordnung).

interface Recipe {
  ingredients: Partial<Record<ItemId, number>>;
  result: ItemId;
}

export const RECIPES: Recipe[] = [
  { ingredients: { eisen: 3, holzplanke: 2 }, result: 'hammer' },
];

export class Crafting {
  private readonly cells: (ItemId | null)[] = new Array(9).fill(null);
  private onCloseCb: (() => void) | null = null;
  private readonly closeBtn = document.getElementById('btn-craft-close') as HTMLButtonElement;
  private readonly onCloseClick = () => this.close();

  constructor(private readonly inventory: Inventory) {}

  get isOpen(): boolean {
    return this.onCloseCb !== null;
  }

  open(onClose: () => void): void {
    this.onCloseCb = onClose;
    this.closeBtn.addEventListener('click', this.onCloseClick);
    UI.show(UI.crafting);
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    // Nicht verbrauchte Zutaten zurück ins Inventar – nichts geht verloren
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c) {
        this.inventory.add(c);
        this.cells[i] = null;
      }
    }
    this.closeBtn.removeEventListener('click', this.onCloseClick);
    UI.hide(UI.crafting);
    const cb = this.onCloseCb;
    this.onCloseCb = null;
    cb?.();
  }

  // Passendes Rezept zur aktuellen Belegung (exakte Mengen, keine Reste)
  private currentResult(): ItemId | null {
    const counts = new Map<ItemId, number>();
    for (const c of this.cells) {
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    for (const recipe of RECIPES) {
      const wanted = Object.entries(recipe.ingredients) as [ItemId, number][];
      const exact =
        wanted.length === counts.size &&
        wanted.every(([id, n]) => counts.get(id) === n);
      if (exact) return recipe.result;
    }
    return null;
  }

  // Klick im Inventar: ein Exemplar ins erste freie Feld legen
  private place(id: ItemId): void {
    const free = this.cells.indexOf(null);
    if (free < 0) return;
    if (this.inventory.consume(id)) {
      this.cells[free] = id;
      this.render();
    }
  }

  // Klick auf ein Feld: Item zurück ins Inventar
  private takeBack(index: number): void {
    const c = this.cells[index];
    if (!c) return;
    if (this.inventory.add(c)) {
      this.cells[index] = null;
      this.render();
    } else {
      UI.toast(STR.inventoryFull);
    }
  }

  private craft(): void {
    const result = this.currentResult();
    if (!result) return;
    if (!this.inventory.add(result)) {
      UI.toast(STR.inventoryFull);
      return;
    }
    this.cells.fill(null);
    UI.toast(STR.crafted(STR.itemNames[result]));
    this.render();
  }

  private render(): void {
    // 3x3-Feld
    const grid = UI.craftGrid;
    grid.innerHTML = '';
    this.cells.forEach((c, i) => {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (c) {
        cell.append(makeItemIcon(c));
        cell.classList.add('usable');
        cell.addEventListener('click', () => this.takeBack(i));
      }
      grid.append(cell);
    });

    // Ergebnis-Feld
    const resultEl = UI.craftResult;
    resultEl.innerHTML = '';
    resultEl.className = 'inv-slot result';
    const result = this.currentResult();
    if (result) {
      resultEl.append(makeItemIcon(result));
      resultEl.classList.add('usable');
      resultEl.addEventListener('click', () => this.craft(), { once: true });
    }

    // Inventar darunter: Klick legt ins Feld
    this.inventory.renderInto(UI.craftInvGrid, (id) => this.place(id));
  }
}
