import { CONFIG } from '../config';
import { PlayerState } from '../player/PlayerController';

// Überlebenswerte des Spielers: Nahrung und Luft, jeweils 0..100.
// Anstrengung (Schwimmen, Tauchen, Gehen) verbraucht Nahrung, Essen
// füllt sie auf. Tauchen verbraucht Luft, an der Oberfläche regeneriert
// sie in wenigen Sekunden. Ohne Luft schwindet die Nahrung schnell,
// ohne Nahrung ist der Spieler erschöpft (verlangsamt).

const S = CONFIG.stats;

export class Stats {
  nahrung = 100;
  luft = 100;

  update(dt: number, state: PlayerState, moving: boolean, underwater: boolean): void {
    // Nahrung: Verbrauch nach Aktivität
    let drain: number = S.nahrungDrain.idle;
    if (moving) {
      switch (state) {
        case PlayerState.Walk:
          drain = S.nahrungDrain.walk;
          break;
        case PlayerState.SwimSurface:
          drain = S.nahrungDrain.swim;
          break;
        case PlayerState.Dive:
          drain = S.nahrungDrain.dive;
          break;
        case PlayerState.Climb:
          drain = S.nahrungDrain.climb;
          break;
      }
    }
    this.nahrung = Math.max(0, this.nahrung - drain * dt);

    // Luft: unter Wasser verbrauchen, darüber regenerieren
    if (underwater) {
      this.luft = Math.max(0, this.luft - S.luftDrain * dt);
      if (this.luft <= 0) {
        this.nahrung = Math.max(0, this.nahrung - S.ohneLuftNahrungDrain * dt);
      }
    } else {
      this.luft = Math.min(100, this.luft + S.luftRegen * dt);
    }
  }

  eat(amount: number): void {
    this.nahrung = Math.min(100, this.nahrung + amount);
  }

  get exhausted(): boolean {
    return this.nahrung <= 0;
  }
}
