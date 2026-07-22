// Einzige Stelle, die DOM-Overlays ein-/ausblendet.

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`UI-Element fehlt: #${id}`);
  return e as T;
}

class UIManagerImpl {
  readonly intro = el('intro');
  readonly introVideo = el<HTMLVideoElement>('intro-video');
  readonly menu = el('menu');
  readonly options = el('options');
  readonly pause = el('pause');
  readonly hud = el('hud');
  readonly prompt = el('prompt');
  readonly inventory = el('inventory');
  readonly inventoryGrid = el('inventory-grid');
  readonly underwater = el('underwater');
  readonly toastEl = el('toast');
  readonly debug = el('debug');
  readonly barNahrung = el('bar-nahrung');
  readonly barLuft = el('bar-luft');
  readonly lowair = el('lowair');

  private toastTimer = 0;

  show(e: HTMLElement): void {
    e.classList.remove('hidden');
  }

  hide(e: HTMLElement): void {
    e.classList.add('hidden');
  }

  setVisible(e: HTMLElement, visible: boolean): void {
    e.classList.toggle('hidden', !visible);
  }

  setBar(bar: HTMLElement, value: number): void {
    bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  setLowAir(severity: number): void {
    this.lowair.style.opacity = String(Math.max(0, Math.min(1, severity)));
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.prompt.textContent = text;
      this.show(this.prompt);
    } else {
      this.hide(this.prompt);
    }
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.show(this.toastEl);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hide(this.toastEl), ms);
  }

  hideAllOverlays(): void {
    for (const e of [this.intro, this.menu, this.options, this.pause, this.hud, this.inventory]) {
      this.hide(e);
    }
    this.hide(this.underwater);
    this.setPrompt(null);
  }
}

export const UI = new UIManagerImpl();
