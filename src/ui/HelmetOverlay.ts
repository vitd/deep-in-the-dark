import { CONFIG } from '../config';

// Taucherhelm-Overlay: legt das HUD-Bild aus public/assets/hud/ über die
// Sicht, sobald der Helm getragen wird (das Rezept dazu kommt später –
// bis dahin setzt ihn das Cheat-Menü auf, siehe PlayState).
//
// Aufbau im DOM: #helmet spannt den Bildschirm auf, darin liegt
// #helmet-img mit dem skalierten Bild. Der riesige Inset-Schatten von
// #helmet-img füllt alles außerhalb des Bildes mit der Helmfarbe – so
// bleibt der Rand dicht, auch wenn das Bild kleiner skaliert wird.

export type HelmetFit = 'strecken' | 'quadrat';

export interface HelmetTuning {
  modus: HelmetFit;
  skalierung: number; // 1 = füllt den Bildschirm genau aus
  versatzX: number; // in % der Bildschirmbreite
  versatzY: number; // in % der Bildschirmhöhe
  deckkraft: number; // 0..1
  pixelig: boolean; // Nearest-Neighbor (passt zum Pixel-Look)
}

const KEY = 'ditd-helm';

function defaults(): HelmetTuning {
  const H = CONFIG.taucherhelm;
  return {
    modus: H.modus as HelmetFit,
    skalierung: H.skalierung,
    versatzX: H.versatzX,
    versatzY: H.versatzY,
    deckkraft: H.deckkraft,
    pixelig: H.pixelig,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class HelmetOverlay {
  private tuning = defaults();
  // getragen = der Spieler hat den Helm auf; sichtbar ist er nur, wenn
  // ihn nicht gerade etwas anderes verdeckt (z. B. die Kamera am Steuer)
  private worn = false;
  private suppressed = false;
  private tuningOn = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly img: HTMLElement,
    private readonly tunePanel: HTMLElement,
  ) {
    this.load();
    this.img.style.backgroundImage = `url(${CONFIG.taucherhelm.bild})`;
    this.img.style.boxShadow = `0 0 0 100vmax ${CONFIG.taucherhelm.randfarbe}`;
    this.apply();
  }

  get isWorn(): boolean {
    return this.worn;
  }

  setWorn(worn: boolean): void {
    this.worn = worn;
    this.apply();
  }

  // Kurzzeitig ausblenden, ohne den Helm abzusetzen (Third-Person am Steuer)
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.apply();
  }

  // ---------- Feinjustierung ----------

  get isTuning(): boolean {
    return this.tuningOn;
  }

  setTuning(on: boolean): void {
    this.tuningOn = on;
    this.tunePanel.classList.toggle('hidden', !on);
    if (on) this.renderPanel();
  }

  // Tastendruck während der Justierung. Gibt true zurück, wenn die Taste
  // verbraucht wurde – dann geht sie nicht mehr an die Spielsteuerung.
  handleKey(code: string, shift: boolean): boolean {
    const t = this.tuning;
    const move = shift ? 0.1 : 0.5; // % Bildschirm
    const zoom = shift ? 0.005 : 0.02;
    switch (code) {
      case 'ArrowLeft': t.versatzX = clamp(t.versatzX - move, -100, 100); break;
      case 'ArrowRight': t.versatzX = clamp(t.versatzX + move, -100, 100); break;
      case 'ArrowUp': t.versatzY = clamp(t.versatzY - move, -100, 100); break;
      case 'ArrowDown': t.versatzY = clamp(t.versatzY + move, -100, 100); break;
      case 'Equal':
      case 'NumpadAdd': t.skalierung = clamp(t.skalierung + zoom, 0.2, 4); break;
      case 'Minus':
      case 'NumpadSubtract': t.skalierung = clamp(t.skalierung - zoom, 0.2, 4); break;
      case 'BracketLeft': t.deckkraft = clamp(t.deckkraft - 0.05, 0, 1); break;
      case 'BracketRight': t.deckkraft = clamp(t.deckkraft + 0.05, 0, 1); break;
      case 'KeyM': t.modus = t.modus === 'strecken' ? 'quadrat' : 'strecken'; break;
      case 'KeyN': t.pixelig = !t.pixelig; break;
      case 'KeyH': this.worn = !this.worn; break;
      case 'KeyR': this.tuning = defaults(); break;
      default: return false;
    }
    this.save();
    this.apply();
    return true;
  }

  // ---------- Darstellung ----------

  private apply(): void {
    const t = this.tuning;
    const visible = this.worn && !this.suppressed;
    this.root.classList.toggle('hidden', !visible);
    this.root.style.opacity = String(t.deckkraft);

    if (t.modus === 'quadrat') {
      // quadratisch und formtreu: die Sichtfenster bleiben rund, oben
      // und unten wird beschnitten
      const side = `${t.skalierung * 100}vmax`;
      this.img.style.width = side;
      this.img.style.height = side;
    } else {
      // auf das Bildschirmformat gezogen: nichts wird beschnitten,
      // dafür sind die Fenster im Breitbild oval
      this.img.style.width = `${t.skalierung * 100}%`;
      this.img.style.height = `${t.skalierung * 100}%`;
    }
    this.img.style.left = `calc(50% + ${t.versatzX}%)`;
    this.img.style.top = `calc(50% + ${t.versatzY}%)`;
    this.img.style.imageRendering = t.pixelig ? 'pixelated' : 'auto';

    if (this.tuningOn) this.renderPanel();
  }

  private renderPanel(): void {
    const t = this.tuning;
    this.tunePanel.textContent =
      `TAUCHERHELM-JUSTIERUNG\n` +
      `H  Helm .......... ${this.worn ? 'auf' : 'ab'}\n` +
      `M  Modus ......... ${t.modus}\n` +
      `+/- Skalierung ... ${t.skalierung.toFixed(3)}\n` +
      `Pfeile Versatz ... ${t.versatzX.toFixed(1)} % / ${t.versatzY.toFixed(1)} %\n` +
      `[ ] Deckkraft .... ${t.deckkraft.toFixed(2)}\n` +
      `N  Pixelig ....... ${t.pixelig ? 'an' : 'aus'}\n` +
      `R  Zurücksetzen · Shift: feine Schritte\n` +
      `\nCONFIG.taucherhelm:\n${this.configSnippet()}`;
  }

  // Die eingestellten Werte so, wie sie in src/config.ts gehören
  configSnippet(): string {
    const t = this.tuning;
    return (
      `modus: '${t.modus}', skalierung: ${+t.skalierung.toFixed(3)}, ` +
      `versatzX: ${+t.versatzX.toFixed(1)}, versatzY: ${+t.versatzY.toFixed(1)}, ` +
      `deckkraft: ${+t.deckkraft.toFixed(2)}, pixelig: ${t.pixelig}`
    );
  }

  // ---------- Persistenz (nur die Justierung, nicht der Tragezustand) ----------

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<HelmetTuning>;
      const t = this.tuning;
      if (data.modus === 'strecken' || data.modus === 'quadrat') t.modus = data.modus;
      if (typeof data.skalierung === 'number') t.skalierung = clamp(data.skalierung, 0.2, 4);
      if (typeof data.versatzX === 'number') t.versatzX = clamp(data.versatzX, -100, 100);
      if (typeof data.versatzY === 'number') t.versatzY = clamp(data.versatzY, -100, 100);
      if (typeof data.deckkraft === 'number') t.deckkraft = clamp(data.deckkraft, 0, 1);
      if (typeof data.pixelig === 'boolean') t.pixelig = data.pixelig;
    } catch {
      // defekte Daten ignorieren, Defaults aus CONFIG behalten
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.tuning));
    } catch {
      // z. B. Speicher voll – die Justierung gilt dann nur für die Sitzung
    }
  }
}
