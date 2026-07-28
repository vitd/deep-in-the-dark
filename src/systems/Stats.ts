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

  // Noch nicht angerechnete Nahrung aus Essen – wird über
  // essenDauerSekunden animiert auf den Balken aufgeschlagen.
  private pendingFood = 0;
  private pendingRate = 0;

  update(dt: number, state: PlayerState, moving: boolean, underwater: boolean): void {
    // Essen langsam anrechnen (animiertes Auffüllen des Balkens)
    if (this.pendingFood > 0) {
      const step = Math.min(this.pendingFood, this.pendingRate * dt);
      this.pendingFood -= step;
      this.nahrung = Math.min(100, this.nahrung + step);
      if (this.pendingFood < 0.01) this.pendingFood = 0;
    }

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
    this.pendingFood += amount;
    // verbleibende Menge in konstanter Zeit vollständig anrechnen
    this.pendingRate = this.pendingFood / S.essenDauerSekunden;
  }

  get exhausted(): boolean {
    return this.nahrung <= 0;
  }
}
