import type { Game } from '../Game';
import { openOptions } from '../ui/OptionsUI';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { MenuState } from './MenuState';
import type { PlayState } from './PlayState';

// Pausemenü: legt sich über das eingefrorene Spiel. Die PlayState-Instanz
// bleibt erhalten und wird bei "Fortsetzen" unverändert reaktiviert.

export class PauseState implements GameState {
  private readonly btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
  private readonly btnOptions = document.getElementById('btn-pause-options') as HTMLButtonElement;
  private readonly btnMenu = document.getElementById('btn-to-menu') as HTMLButtonElement;

  private readonly onResume = () => this.game.setState(this.playState);
  private readonly onOptions = () => {
    UI.hide(UI.pause);
    openOptions(() => UI.show(UI.pause));
  };
  private readonly onMenu = () => {
    this.playState.dispose();
    this.game.setState(new MenuState(this.game));
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.onResume();
  };

  constructor(
    private readonly game: Game,
    private readonly playState: PlayState,
  ) {}

  enter(): void {
    UI.show(UI.pause);
    this.btnResume.addEventListener('click', this.onResume);
    this.btnOptions.addEventListener('click', this.onOptions);
    this.btnMenu.addEventListener('click', this.onMenu);
    document.addEventListener('keydown', this.onKey);
  }

  exit(): void {
    this.btnResume.removeEventListener('click', this.onResume);
    this.btnOptions.removeEventListener('click', this.onOptions);
    this.btnMenu.removeEventListener('click', this.onMenu);
    document.removeEventListener('keydown', this.onKey);
    UI.hide(UI.pause);
    UI.hide(UI.options);
  }

  update(): void {}

  render(): void {
    // eingefrorene Spielszene weiterzeigen
    this.playState.render();
  }
}
