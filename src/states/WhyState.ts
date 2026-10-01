import { CONFIG } from '../config';
import type { Game } from '../Game';
import { Audio } from '../systems/AudioManager';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { MenuState } from './MenuState';
import { PlayState } from './PlayState';

// Nach Sunkeys Sprung: völlige Stille, schwarzer Bildschirm. Nach ein
// paar Sekunden erscheint langsam ein großes, zitterndes „WHY?“, und
// ganz leise beginnt „Daisy Bell“. Später tauchen dezent „Neuer
// Versuch“ und „Zum Hauptmenü“ auf – das Spiel ist hier zu Ende.

const E = CONFIG.sunkey.ende;

export class WhyState implements GameState {
  private zeit = 0;
  private whyGezeigt = false;
  private knoepfeGezeigt = false;
  private stopDaisy: (() => void) | null = null;
  private readonly btnRetry = document.getElementById('btn-why-retry') as HTMLButtonElement;
  private readonly btnMenu = document.getElementById('btn-why-menu') as HTMLButtonElement;

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
    Audio.stille();
    UI.whyText.classList.remove('zeigen');
    UI.whyText.style.transitionDuration = `${E.einblenden}s`;
    UI.whyKnoepfe.classList.remove('zeigen');
    UI.show(UI.why);
    this.btnRetry.addEventListener('click', this.onRetry);
    this.btnMenu.addEventListener('click', this.onMenu);
  }

  exit(): void {
    this.btnRetry.removeEventListener('click', this.onRetry);
    this.btnMenu.removeEventListener('click', this.onMenu);
    this.stopDaisy?.();
    this.stopDaisy = null;
    UI.hide(UI.why);
    UI.whyText.classList.remove('zeigen');
    UI.whyKnoepfe.classList.remove('zeigen');
    Audio.laut();
  }

  update(dt: number): void {
    this.zeit += dt;
    if (!this.whyGezeigt && this.zeit >= E.schwarz) {
      this.whyGezeigt = true;
      UI.whyText.classList.add('zeigen');
      this.stopDaisy = Audio.daisyBell(E.daisyLautstaerke, E.daisySchlag);
    }
    if (!this.knoepfeGezeigt && this.zeit >= E.schwarz + E.knoepfeNach) {
      this.knoepfeGezeigt = true;
      UI.whyKnoepfe.classList.add('zeigen');
    }
  }

  render(): void {
    // nur Schwarz – das Overlay deckt ohnehin alles ab
    this.game.pixelRenderer.clear();
  }
}
