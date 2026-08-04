// Audio-Stub für Milestone 1: verwaltet nur die Master-Lautstärke,
// damit der Optionen-Regler etwas Reales steuert. Sounds folgen später.

import { settings } from './Settings';

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private humGain: GainNode | null = null;

  get volume(): number {
    return settings.volume;
  }

  play(_name: string): void {
    // Absichtlich leer – Sound-Assets existieren noch nicht.
  }

  // Tiefes Motor-Brummen (synthetisch, kein Asset nötig)
  startHum(): void {
    if (this.humGain) return;
    try {
      this.ctx = this.ctx ?? new AudioContext();
      const ctx = this.ctx;
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 52;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 26;
      // leichtes Wummern über einen LFO auf die Lautstärke
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const gain = ctx.createGain();
      gain.gain.value = 0.12 * settings.volume;
      lfo.connect(lfoGain).connect(gain.gain);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(ctx.destination);
      osc1.start();
      osc2.start();
      lfo.start();
      this.humGain = gain;
    } catch {
      // Audio nicht verfügbar – Spiel läuft stumm weiter
    }
  }

  stopHum(): void {
    if (this.humGain && this.ctx) {
      this.humGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      const g = this.humGain;
      window.setTimeout(() => g.disconnect(), 400);
      this.humGain = null;
    }
  }
}

export const Audio = new AudioManagerImpl();
