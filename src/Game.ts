import { PixelRenderer } from './rendering/PixelRenderer';
import { GameState } from './states/GameState';
import { IntroState } from './states/IntroState';
import { loadSettings } from './systems/Settings';

// Spielkern: besitzt Renderer und Hauptschleife, verwaltet den
// aktiven Zustand (Intro → Menü → Spiel ⇄ Pause).

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly pixelRenderer: PixelRenderer;
  private state: GameState | null = null;
  private last = performance.now();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.pixelRenderer = new PixelRenderer(this.canvas);
    loadSettings();
  }

  setState(next: GameState): void {
    this.state?.exit();
    this.state = next;
    next.enter();
  }

  start(): void {
    this.setState(new IntroState(this));
    requestAnimationFrame(this.loop);
  }

  private readonly loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    // Ein Fehler in einem einzelnen Bild darf die Schleife nicht
    // lahmlegen: sonst bleibt das letzte Bild stehen, und Zustands-
    // wechsel (z. B. zum Todes-Screen) kommen nie an. Jeder Fehler wird
    // nur einmal gemeldet, damit die Konsole nicht vollläuft.
    try {
      this.state?.update(dt);
    } catch (e) {
      this.melde('update', e);
    }
    try {
      this.state?.render();
    } catch (e) {
      this.melde('render', e);
    }
  };

  private readonly gemeldet = new Set<string>();

  private melde(wo: string, e: unknown): void {
    const text = `${wo}: ${e instanceof Error ? e.message : String(e)}`;
    if (this.gemeldet.has(text)) return;
    this.gemeldet.add(text);
    console.error(`Fehler in der Spielschleife (${wo})`, e);
  }
}
