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

  // Kreischen beim Jumpscare des Stalkers: ein abstürzender Sägezahn
  // über einem Rauschstoß – synthetisch, also ohne Asset.
  screech(): void {
    try {
      this.ctx = this.ctx ?? new AudioContext();
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const dauer = 1.1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.5 * settings.volume + 0.0001, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, t0);
      osc.frequency.exponentialRampToValueAtTime(70, t0 + dauer);
      const dist = ctx.createBiquadFilter();
      dist.type = 'bandpass';
      dist.frequency.value = 900;
      dist.Q.value = 1.5;
      osc.connect(dist).connect(gain);

      // Rauschstoß: ein kurzer Puffer mit Zufallswerten
      const len = Math.floor(ctx.sampleRate * dauer);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.35;
      noise.connect(noiseGain).connect(gain);

      osc.start(t0);
      osc.stop(t0 + dauer);
      noise.start(t0);
    } catch {
      // Audio nicht verfügbar – dann eben nur der Schreck fürs Auge
    }
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
