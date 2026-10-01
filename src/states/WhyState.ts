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
//   3. Sunkeys wandern von links nach rechts über den Bildschirm, immer
//      fünf zugleich
//   4. Blendgranate: weißer Blitz, dazu der Stalker-Schrei rückwärts
//   5. dezent „Neuer Versuch“ und „Zum Hauptmenü“

const E = CONFIG.sunkey.ende;

interface Wanderer {
  el: HTMLImageElement;
  x: number; // linke Kante in px
  y: number; // obere Kante in px
  hoehe: number; // px
  tempo: number; // px/s
  schritt: number; // Phase des Watschelns
}

const zufall = (a: number, b: number): number => a + Math.random() * (b - a);

export class WhyState implements GameState {
  private zeit = 0;
  private whyGezeigt = false;
  private wandernAb = E.schwarz + E.einblenden;
  private blitzAb = this.wandernAb + E.wandern;
  private geblitzt = false;
  private knoepfeGezeigt = false;
  private stopDaisy: (() => void) | null = null;
  private readonly schrei = Audio.schreiRueckwaerts(); // lädt schon vor
  private bildUrl: string | null = null;
  private readonly wanderer: Wanderer[] = [];
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
    UI.hide(UI.why);
    UI.whyText.classList.remove('zeigen');
    UI.whyKnoepfe.classList.remove('zeigen');
    UI.whyWanderer.innerHTML = '';
    UI.whyBlitz.style.opacity = '0';
    this.wanderer.length = 0;
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

    // Wandern, sobald „WHY?“ ganz da ist, bis zum Blitz
    if (t >= this.wandernAb && t < this.blitzAb) {
      if (this.wanderer.length === 0 && this.bildUrl) this.wandererStarten();
      this.wandererBewegen(dt);
    }

    if (!this.geblitzt && t >= this.blitzAb) {
      this.geblitzt = true;
      UI.whyWanderer.innerHTML = '';
      this.wanderer.length = 0;
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

  // Fünf Sunkeys, gestaffelt links außerhalb des Bildes
  private wandererStarten(): void {
    const breite = window.innerWidth;
    for (let k = 0; k < E.wandererAnzahl; k++) {
      const el = document.createElement('img');
      el.src = this.bildUrl!;
      el.alt = '';
      UI.whyWanderer.append(el);
      const w: Wanderer = { el, x: 0, y: 0, hoehe: 0, tempo: 0, schritt: 0 };
      this.neuAufstellen(w);
      w.x = -w.hoehe * 0.6 - (k * breite) / E.wandererAnzahl;
      this.wanderer.push(w);
    }
  }

  private neuAufstellen(w: Wanderer): void {
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    w.hoehe = hoehe * zufall(E.groesseMin, E.groesseMax);
    w.el.style.height = `${Math.round(w.hoehe)}px`;
    w.y = zufall(-w.hoehe * 0.1, hoehe - w.hoehe * 0.9);
    w.tempo = (breite + w.hoehe) / zufall(E.querungMin, E.querungMax);
    w.schritt = Math.random() * Math.PI * 2;
    w.x = -w.hoehe * 0.6;
  }

  private wandererBewegen(dt: number): void {
    const breite = window.innerWidth;
    for (const w of this.wanderer) {
      w.x += w.tempo * dt;
      if (w.x > breite) this.neuAufstellen(w);
      // Watscheln: hüpfen und kippen im Schritttakt
      w.schritt += dt * 9;
      const hopp = -Math.abs(Math.sin(w.schritt)) * w.hoehe * 0.06;
      const kipp = Math.sin(w.schritt) * 5;
      w.el.style.transform = `translate(${w.x.toFixed(1)}px, ${(w.y + hopp).toFixed(1)}px) rotate(${kipp.toFixed(1)}deg)`;
    }
  }

  render(): void {
    // nur Schwarz – das Overlay deckt ohnehin alles ab
    this.game.pixelRenderer.clear();
  }
}
