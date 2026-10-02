import { CONFIG } from '../config';
import type { Game } from '../Game';
import { Audio } from '../systems/AudioManager';
import { sunkeyBild } from '../ui/SunkeyBild';
import { sunkeyNachspiel } from '../ui/SunkeyParade';
import { UI } from '../ui/UIManager';
import { GameState } from './GameState';
import { PlayState } from './PlayState';

// Nach Sunkeys Sprung – man stirbt NICHT, das Spiel geht danach weiter:
//   1. völlige Stille, schwarzer Bildschirm
//   2. langsam ein großes, zitterndes, rotes „WHY?“; dazu beginnt „Daisy
//      Bell“ rückwärts und schwillt von 0 auf volle Lautstärke an
//   3. der Stalker-Schrei rückwärts (die Musik bricht ab)
//   4. ist der Schrei vorbei, verschwindet der schwarze Bildschirm mit
//      einem Blitz, und über dem wieder laufenden Spiel ziehen große
//      Sunkeys direkt hintereinander von rechts nach links, dazu ihr
//      irres Lachen (src/ui/SunkeyParade.ts)

const E = CONFIG.sunkey.ende;

export class WhyState implements GameState {
  private zeit = 0;
  private whyGezeigt = false;
  private readonly schreiAb = E.schwarz + E.musikAnschwellen;
  private geschrien = false;
  private blitzAb = Infinity;
  private musik: { stoppen: (ausblenden: number) => void } | null = null;
  private readonly schrei = Audio.schreiRueckwaerts(); // lädt schon vor
  private readonly lachen = Audio.sampleVorladen(E.lachenDatei, E.lachenLautstaerke);
  private bildUrl: string | null = null;
  private weitergegeben = false;

  constructor(
    private readonly game: Game,
    private readonly playState: PlayState,
  ) {
    sunkeyBild()
      .then((url) => (this.bildUrl = url))
      .catch(() => {
        // ohne Bild zieht eben niemand vorbei
      });
  }

  enter(): void {
    document.exitPointerLock();
    Audio.stille();
    UI.whyText.classList.remove('zeigen');
    UI.whyText.style.transitionDuration = `${E.einblenden}s`;
    UI.show(UI.why);
  }

  exit(): void {
    this.musik?.stoppen(0.05);
    this.musik = null;
    this.schrei.schliessen();
    // Das Lachen gehört ab dem Blitz dem Nachspiel
    if (!this.weitergegeben) this.lachen.schliessen();
    UI.hide(UI.why);
    UI.whyText.classList.remove('zeigen');
    Audio.laut();
  }

  update(dt: number): void {
    this.zeit += dt;
    const t = this.zeit;

    if (!this.whyGezeigt && t >= E.schwarz) {
      this.whyGezeigt = true;
      UI.whyText.classList.add('zeigen');
      this.musik = Audio.daisyBellRueckwaerts(E.musikVoll, E.musikAnschwellen, E.daisySchlag);
    }

    if (!this.geschrien && t >= this.schreiAb) {
      this.geschrien = true;
      this.musik?.stoppen(0.15);
      this.musik = null;
      this.schrei.spielen();
    }

    // Schrei vorbei (Länge erst nach dem Laden bekannt): Blitz
    if (this.geschrien && this.blitzAb === Infinity) {
      const d = this.schrei.dauer();
      if (d !== null) this.blitzAb = this.schreiAb + d;
      else if (t >= this.schreiAb + 6) this.blitzAb = t; // ohne Sample nicht ewig warten
    }
    if (t >= this.blitzAb) {
      this.weitergegeben = true;
      sunkeyNachspiel(this.bildUrl, this.lachen);
      this.game.setState(this.playState); // zurück ins Spiel
    }
  }

  render(): void {
    // nur Schwarz – das Overlay deckt ohnehin alles ab
    this.game.pixelRenderer.clear();
  }
}
