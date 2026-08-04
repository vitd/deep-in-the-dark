import { CONFIG } from '../config';
import { Inventory, ItemId, makeItemIcon } from './Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

// Werkbank (Crafting-Tisch in der Kajüte): 3x3-Feld wie in Minecraft.
// Per Klick wandern Items aus dem Inventar in die Felder und zurück.
// Passt die Belegung zu einem Rezept, erscheint das Ergebnis rechts;
// ein Klick darauf verbraucht die Zutaten.
//
// Fässer werden ZERLEGT statt verbaut: Ein Klick auf ein Fass im
// Inventar legt es in den rechten Slot, und die Ausbeute (4 Planken,
// 4 Eisen + Zufallsinhalt) erscheint links im 3x3-Feld.

interface Recipe {
  ingredients: Partial<Record<ItemId, number>>;
  result: ItemId;
}

export const RECIPES: Recipe[] = [
  { ingredients: { eisen: 3, holzplanke: 2 }, result: 'hammer' },
];

interface Cell {
  id: ItemId;
  count: number;
}

export class Crafting {
  private readonly cells: (Cell | null)[] = new Array(9).fill(null);
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
    // Nicht verbrauchte Inhalte zurück ins Inventar – nichts geht verloren
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c) {
        for (let n = 0; n < c.count; n++) this.inventory.add(c.id);
        this.cells[i] = null;
      }
    }
    this.closeBtn.removeEventListener('click', this.onCloseClick);
    UI.hide(UI.crafting);
    const cb = this.onCloseCb;
    this.onCloseCb = null;
    cb?.();
  }

  private cellCounts(): Map<ItemId, number> {
    const counts = new Map<ItemId, number>();
    for (const c of this.cells) {
      if (c) counts.set(c.id, (counts.get(c.id) ?? 0) + c.count);
    }
    return counts;
  }

  // Passendes Rezept zur aktuellen Belegung (exakte Mengen, keine Reste)
  private currentResult(): ItemId | null {
    const counts = this.cellCounts();
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

  // Klick im Inventar: Zutat ins Feld legen – Fässer werden zerlegt
  private place(id: ItemId): void {
    if (id === 'fass') {
      this.dismantleBarrel();
      return;
    }
    // erst auf vorhandenen Stapel gleichen Typs, sonst freie Zelle
    let cell = this.cells.find((c) => c && c.id === id && c.count < CONFIG.inventory.maxStack);
    if (!cell) {
      const free = this.cells.indexOf(null);
      if (free < 0) return;
      if (!this.inventory.consume(id)) return;
      this.cells[free] = { id, count: 1 };
      this.render();
      return;
    }
    if (this.inventory.consume(id)) {
      cell.count++;
      this.render();
    }
  }

  // Fass zerlegen: Fass in den rechten Slot, Ausbeute erscheint links
  private dismantleBarrel(): void {
    if (this.cells.some((c) => c !== null)) {
      UI.toast(STR.dismantleBlocked);
      return;
    }
    if (!this.inventory.consume('fass')) return;

    const yields = new Map<ItemId, number>();
    const B = CONFIG.barrels;
    for (const [id, n] of Object.entries(B.fixedYield) as [ItemId, number][]) {
      yields.set(id, n);
    }
    for (const [id, max] of Object.entries(B.randomLoot) as [ItemId, number][]) {
      const n = Math.floor(Math.random() * (max + 1));
      if (n > 0) yields.set(id, (yields.get(id) ?? 0) + n);
    }

    // rechter Slot zeigt kurz das zerlegte Fass, links liegt die Ausbeute
    let i = 0;
    for (const [id, count] of yields) {
      if (i >= this.cells.length) break;
      this.cells[i++] = { id, count };
    }
    UI.toast(STR.dismantled);
    this.render('fass');
  }

  // Klick auf eine Zelle: ganzen Stapel zurück ins Inventar
  private takeBack(index: number): void {
    const c = this.cells[index];
    if (!c) return;
    while (c.count > 0 && this.inventory.add(c.id)) {
      c.count--;
    }
    if (c.count === 0) this.cells[index] = null;
    else UI.toast(STR.inventoryFull);
    this.render();
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

  private render(resultOverride?: ItemId): void {
    // 3x3-Feld
    const grid = UI.craftGrid;
    grid.innerHTML = '';
    this.cells.forEach((c, i) => {
      const cell = document.createElement('div');
      cell.className = 'inv-slot';
      if (c) {
        const count = document.createElement('div');
        count.className = 'inv-count';
        count.textContent = String(c.count);
        cell.append(makeItemIcon(c.id), count);
        cell.classList.add('usable');
        cell.addEventListener('click', () => this.takeBack(i));
      }
      grid.append(cell);
    });

    // Ergebnis-Feld (bzw. gerade zerlegtes Fass)
    const resultEl = UI.craftResult;
    resultEl.innerHTML = '';
    resultEl.className = 'inv-slot result';
    const result = resultOverride ?? this.currentResult();
    if (result) {
      resultEl.append(makeItemIcon(result));
      if (!resultOverride) {
        resultEl.classList.add('usable');
        resultEl.addEventListener('click', () => this.craft(), { once: true });
      }
    }

    // Inventar darunter: Klick legt ins Feld / zerlegt Fässer
    this.inventory.renderInto(UI.craftInvGrid, (id) => this.place(id));
  }
}
