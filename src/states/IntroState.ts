import type { Game } from '../Game';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { MenuState } from './MenuState';

// Spielt public/assets/intro.mp4 ab (Datei liefert der Kunde später).
// Fehlt die Datei oder endet das Video, geht es weiter ins Hauptmenü.
// Überspringen: Esc, Leertaste oder Klick.

export class IntroState implements GameState {
  private finished = false;

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.finish();
  };

  private readonly onClick = () => this.finish();
  private readonly onEnded = () => this.finish();
  private readonly onError = () => this.finish();

  constructor(private readonly game: Game) {}

  enter(): void {
    UI.show(UI.intro);
    const video = UI.introVideo;
    video.addEventListener('ended', this.onEnded);
    video.addEventListener('error', this.onError, true);
    document.addEventListener('keydown', this.onKey);
    UI.intro.addEventListener('click', this.onClick);

    video.src = 'assets/intro.mp4';
    video.play().catch(() => this.finish());

    // Sicherheitsnetz: Wenn nach kurzer Zeit nichts abspielbar ist
    // (z. B. Datei fehlt), direkt ins Menü.
    window.setTimeout(() => {
      if (!this.finished && (video.readyState < 2 || video.error)) this.finish();
    }, 4000);
  }

  exit(): void {
    const video = UI.introVideo;
    video.pause();
    video.removeAttribute('src');
    video.removeEventListener('ended', this.onEnded);
    video.removeEventListener('error', this.onError, true);
    document.removeEventListener('keydown', this.onKey);
    UI.intro.removeEventListener('click', this.onClick);
    UI.hide(UI.intro);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.game.setState(new MenuState(this.game));
  }

  update(): void {}

  render(): void {
    this.game.pixelRenderer.clear();
  }
}
