import { CONFIG } from '../config';
import type { Game } from '../Game';
import { Audio } from '../systems/AudioManager';
import { sunkeyBild } from '../ui/SunkeyBild';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { MenuState } from './MenuState';
import { PlayState } from './PlayState';

// Nach Sunkeys Sprung – das Spiel ist hier zu Ende:
//   1. völlige Stille, schwarzer Bildschirm
//   2. langsam ein großes, zitterndes „WHY?“, dazu ganz leise „Daisy Bell“
//   3. eine riesige Sunkey wandert von ganz rechts nach ganz links über
//      den Bildschirm, dazu ihr irres, verzerrtes Lachen
//   4. Blendgranate: weißer Blitz, dazu der Stalker-Schrei rückwärts
//   5. dezent „Neuer Versuch“ und „Zum Hauptmenü“

const E = CONFIG.sunkey.ende;


export class WhyState implements GameState {
  private zeit = 0;
  private whyGezeigt = false;
  private wandernAb = E.schwarz + E.einblenden;
  private blitzAb = this.wandernAb + E.wandern;
  private geblitzt = false;
  private knoepfeGezeigt = false;
  private stopDaisy: (() => void) | null = null;
  private readonly schrei = Audio.schreiRueckwaerts(); // lädt schon vor
  private readonly lachen = Audio.sampleVorladen(E.lachenDatei, E.lachenLautstaerke);
  private bildUrl: string | null = null;
  private wanderer: HTMLImageElement | null = null;
  private lachtSchon = false;
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
  ) {
    sunkeyBild()
      .then((url) => (this.bildUrl = url))
      .catch(() => {
        // ohne Bild wandert eben niemand
      });
  }

  enter(): void {
    document.exitPointerLock();
    Audio.stille();
    UI.whyText.classList.remove('zeigen');
    UI.whyText.style.transitionDuration = `${E.einblenden}s`;
    UI.whyKnoepfe.classList.remove('zeigen');
    UI.whyWanderer.innerHTML = '';
    UI.whyBlitz.style.opacity = '0';
    UI.show(UI.why);
    this.btnRetry.addEventListener('click', this.onRetry);
    this.btnMenu.addEventListener('click', this.onMenu);
  }

  exit(): void {
    this.btnRetry.removeEventListener('click', this.onRetry);
    this.btnMenu.removeEventListener('click', this.onMenu);
    this.stopDaisy?.();
    this.stopDaisy = null;
    this.schrei.schliessen();
    this.lachen.schliessen();
    UI.hide(UI.why);
    UI.whyText.classList.remove('zeigen');
    UI.whyKnoepfe.classList.remove('zeigen');
    UI.whyWanderer.innerHTML = '';
    UI.whyBlitz.style.opacity = '0';
    this.wanderer = null;
    Audio.laut();
  }

  update(dt: number): void {
    this.zeit += dt;
    const t = this.zeit;

    if (!this.whyGezeigt && t >= E.schwarz) {
      this.whyGezeigt = true;
      UI.whyText.classList.add('zeigen');
      this.stopDaisy = Audio.daisyBell(E.daisyLautstaerke, E.daisySchlag);
    }

    // Wandern und Lachen, sobald „WHY?“ ganz da ist, bis zum Blitz
    if (t >= this.wandernAb && t < this.blitzAb) {
      if (!this.lachtSchon) {
        this.lachtSchon = true;
        this.lachen.spielen();
      }
      if (!this.wanderer && this.bildUrl) this.wandererStarten();
      this.wandererBewegen((t - this.wandernAb) / E.wandern);
    }

    if (!this.geblitzt && t >= this.blitzAb) {
      this.geblitzt = true;
      UI.whyWanderer.innerHTML = '';
      this.wanderer = null;
      this.lachen.stoppen();
      this.schrei.spielen();
    }
    if (this.geblitzt) {
      // voll weiß, dann langsam zurück ins Schwarz
      const u = t - this.blitzAb;
      const deck = u < E.blitzHalten ? 1 : Math.max(0, 1 - (u - E.blitzHalten) / E.blitzAbklingen);
      UI.whyBlitz.style.opacity = deck.toFixed(3);
    }

    if (!this.knoepfeGezeigt && t >= this.blitzAb + E.knoepfeNachBlitz) {
      this.knoepfeGezeigt = true;
      UI.whyKnoepfe.classList.add('zeigen');
    }
  }

  // Eine einzige, riesige Sunkey – fast so hoch wie der Bildschirm
  private wandererStarten(): void {
    const el = document.createElement('img');
    el.src = this.bildUrl!;
    el.alt = '';
    el.style.height = `${Math.round(window.innerHeight * E.wandererHoehe)}px`;
    UI.whyWanderer.append(el);
    this.wanderer = el;
  }

  // u = 0..1 über die Wanderzeit: von ganz rechts (komplett außerhalb)
  // bis ganz links (komplett außerhalb), schwer watschelnd
  private wandererBewegen(u: number): void {
    const el = this.wanderer;
    if (!el) return;
    const breite = window.innerWidth;
    const hoehe = window.innerHeight * E.wandererHoehe;
    const figurBreite = el.offsetWidth || hoehe * 0.53;
    const x = breite - u * (breite + figurBreite);
    const y = (window.innerHeight - hoehe) / 2;
    const schritt = u * E.wandern * 4.2; // Schritte
    const hopp = -Math.abs(Math.sin(schritt)) * hoehe * 0.035;
    const kipp = Math.sin(schritt) * 3.5;
    el.style.transform = `translate(${x.toFixed(1)}px, ${(y + hopp).toFixed(1)}px) rotate(${kipp.toFixed(2)}deg)`;
  }

  render(): void {
    // nur Schwarz – das Overlay deckt ohnehin alles ab
    this.game.pixelRenderer.clear();
  }
}
