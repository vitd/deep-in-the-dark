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
    this.state?.update(dt);
    this.state?.render();
  };
}
