import type { Game } from '../Game';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { MenuState } from './MenuState';
import { PlayState } from './PlayState';

// Todes-Screen (z. B. ertrunken): zeigt die eingefrorene Szene hinter
// einem roten Overlay. "Neuer Versuch" startet ein frisches Spiel.

export class DeathState implements GameState {
  private readonly btnRetry = document.getElementById('btn-death-retry') as HTMLButtonElement;
  private readonly btnMenu = document.getElementById('btn-death-menu') as HTMLButtonElement;

  private readonly onRetry = () => {
    this.playState.dispose();
    this.game.setState(new PlayState(this.game));
  };

  private readonly onMenu = () => {
    this.playState.dispose();
    this.game.setState(new MenuState(this.game));
  };

  constructor(
    private readonly game: Game,
    private readonly playState: PlayState,
  ) {}

  enter(): void {
    document.exitPointerLock();
    UI.show(UI.death);
    this.btnRetry.addEventListener('click', this.onRetry);
    this.btnMenu.addEventListener('click', this.onMenu);
  }

  exit(): void {
    this.btnRetry.removeEventListener('click', this.onRetry);
    this.btnMenu.removeEventListener('click', this.onMenu);
    UI.hide(UI.death);
  }

  update(): void {}

  render(): void {
    this.playState.render();
  }
}
