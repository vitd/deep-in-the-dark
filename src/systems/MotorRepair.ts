import { CONFIG } from '../config';
import { ItemId } from './Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

// Reparatur-Fortschritt des Motors: Materialien werden nach und nach
// "angewandt" (E am Motor mit gewähltem Material in der Hotbar bzw.
// Treibstoff automatisch aus dem Vorrat). Das Panel zeigt pro Material
// einen Fortschrittsbalken.

const R = CONFIG.motorRepair;

export type MotorMaterial = 'eisen' | 'gold' | 'nyzerin' | 'glyzerin';

const NEEDS: { id: MotorMaterial; required: number }[] = [
  { id: 'eisen', required: R.eisen },
  { id: 'gold', required: R.gold },
  { id: 'nyzerin', required: R.nyzerin },
  { id: 'glyzerin', required: R.glyzerin },
];

export class MotorRepair {
  private readonly applied = new Map<MotorMaterial, number>();
  fuelApplied = 0;
  running = false;

  needs(id: ItemId): boolean {
    return NEEDS.some((n) => n.id === id && this.remaining(n.id) > 0);
  }

  remaining(id: MotorMaterial): number {
    const need = NEEDS.find((n) => n.id === id);
    if (!need) return 0;
    return Math.max(0, need.required - (this.applied.get(id) ?? 0));
  }

  get fuelRemaining(): number {
    return Math.max(0, R.treibstoffLiter - this.fuelApplied);
  }

  // Wendet bis zu `count` Stück an; Rückgabe = tatsächlich verbaut
  apply(id: MotorMaterial, count: number): number {
    const take = Math.min(count, this.remaining(id));
    if (take > 0) this.applied.set(id, (this.applied.get(id) ?? 0) + take);
    return take;
  }

  applyFuel(liter: number): number {
    const take = Math.min(liter, this.fuelRemaining);
    this.fuelApplied += take;
    return take;
  }

  get complete(): boolean {
    return NEEDS.every((n) => this.remaining(n.id) === 0) && this.fuelRemaining === 0;
  }

  // Panel mit Fortschrittsbalken rendern
  renderPanel(): void {
    const panel = UI.motorPanel;
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'mp-title';
    title.textContent = this.complete ? STR.motorRunning : STR.motorRepairTitle;
    panel.append(title);

    const rows: { label: string; have: number; need: number }[] = NEEDS.map((n) => ({
      label: STR.itemNames[n.id],
      have: this.applied.get(n.id) ?? 0,
      need: n.required,
    }));
    rows.push({ label: 'Treibstoff (L)', have: this.fuelApplied, need: R.treibstoffLiter });

    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'mp-row';
      const label = document.createElement('span');
      label.className = 'mp-label';
      label.textContent = r.label;
      const track = document.createElement('div');
      track.className = 'mp-track';
      const fill = document.createElement('div');
      fill.className = 'mp-fill' + (r.have >= r.need ? ' done' : '');
      fill.style.width = `${Math.min(100, (r.have / r.need) * 100)}%`;
      track.append(fill);
      const num = document.createElement('span');
      num.className = 'mp-num';
      num.textContent = `${r.have}/${r.need}`;
      row.append(label, track, num);
      panel.append(row);
    }
  }
}
