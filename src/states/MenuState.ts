import type { Game } from '../Game';
import { openOptions } from '../ui/OptionsUI';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { PlayState } from './PlayState';

// Hauptmenü: Neues Spiel, Spiel laden (Stub), Optionen, Beenden.

// "Beenden" ist bewusst isoliert: im Browser nur ein Versuch + Hinweis,
// im späteren nativen Build (Tauri) ruft diese Funktion die Exit-API auf.
function quitGame(): void {
  window.close();
  window.setTimeout(() => UI.toast(STR.quitBrowserHint), 150);
}

export class MenuState implements GameState {
  private readonly btnNew = document.getElementById('btn-new') as HTMLButtonElement;
  private readonly btnLoad = document.getElementById('btn-load') as HTMLButtonElement;
  private readonly btnOptions = document.getElementById('btn-options') as HTMLButtonElement;
  private readonly btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;

  private readonly onNew = () => this.game.setState(new PlayState(this.game));
  private readonly onLoad = () => UI.toast(STR.loadNotAvailable);
  private readonly onOptions = () => {
    UI.hide(UI.menu);
    openOptions(() => UI.show(UI.menu));
  };
  private readonly onQuit = () => quitGame();

  constructor(private readonly game: Game) {}

  enter(): void {
    UI.show(UI.menu);
    this.btnNew.addEventListener('click', this.onNew);
    this.btnLoad.addEventListener('click', this.onLoad);
    this.btnOptions.addEventListener('click', this.onOptions);
    this.btnQuit.addEventListener('click', this.onQuit);
  }

  exit(): void {
    this.btnNew.removeEventListener('click', this.onNew);
    this.btnLoad.removeEventListener('click', this.onLoad);
    this.btnOptions.removeEventListener('click', this.onOptions);
    this.btnQuit.removeEventListener('click', this.onQuit);
    UI.hide(UI.menu);
    UI.hide(UI.options);
  }

  update(): void {}

  render(): void {
    this.game.pixelRenderer.clear();
  }
}
