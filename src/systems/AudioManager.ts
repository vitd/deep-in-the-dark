// Audio: Master-Lautstärke aus den Optionen, dazu ein paar synthetische
// Geräusche (Motorbrummen, Schrei beim Jumpscare). Für den Schrei kann
// eine Sounddatei hinterlegt werden – fehlt sie, synthetisiert der
// Manager ihn selbst, das Spiel läuft also ohne Assets.

import { CONFIG } from '../config';
import { settings } from './Settings';

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private humGain: GainNode | null = null;
  // Schrei-Sample. `schreiDaten` sind die geladenen Rohdaten, `schrei`
  // der fertig dekodierte Puffer; false heißt: keine (brauchbare) Datei.
  private schreiDaten: ArrayBuffer | null | false = null;
  private schrei: AudioBuffer | false | null = null;
  private schreiLaeuft = false;

  get volume(): number {
    return settings.volume;
  }

  play(_name: string): void {
    // Absichtlich leer – Sound-Assets existieren noch nicht.
  }

  // Beim Spielstart aufrufen: lädt den Schrei im Hintergrund, damit er
  // beim ersten Jumpscare bereitsteht. Ohne Datei bleibt es beim
  // synthetischen Schrei.
  preload(): void {
    this.ladeSchrei();
  }

  // Nur laden, nicht dekodieren: Dekodieren braucht einen
  // AudioContext, und den gibt es erst nach der ersten Nutzergeste.
  private ladeSchrei(): void {
    if (this.schreiDaten !== null || this.schreiLaeuft) return;
    this.schreiLaeuft = true;
    fetch(CONFIG.audio.schreiDatei)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('keine Datei'))))
      .then((daten) => {
        this.schreiDaten = daten;
      })
      .catch(() => {
        this.schreiDaten = false; // keine Datei – dann synthetisch schreien
        this.schrei = false;
      })
      .finally(() => {
        this.schreiLaeuft = false;
      });
  }

  // Schrei beim Jumpscare des Stalkers. Bevorzugt das Sample aus
  // CONFIG.audio.schreiDatei; ohne Datei kommt der synthetische Schrei.
  screech(): void {
    try {
      this.ctx = this.ctx ?? new AudioContext();
      this.ctx.resume().catch(() => {}); // ohne Nutzergeste ggf. blockiert
      if (this.schrei) {
        this.spieleSchrei(this.schrei);
        return;
      }
      if (this.schreiDaten) {
        // Rohdaten sind da: dekodieren und abspielen. Die paar
        // Millisekunden fallen im Schreck nicht auf.
        const daten = this.schreiDaten;
        this.schreiDaten = null;
        this.ctx
          .decodeAudioData(daten)
          .then((buffer) => {
            this.schrei = buffer;
            this.spieleSchrei(buffer);
          })
          .catch(() => {
            this.schrei = false; // Datei unbrauchbar
            this.synthSchrei();
          });
        return;
      }
      this.ladeSchrei(); // fürs nächste Mal
      this.synthSchrei();
    } catch {
      // Audio nicht verfügbar – dann eben nur der Schreck fürs Auge
    }
  }

  private spieleSchrei(buffer: AudioBuffer): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = CONFIG.audio.schreiLautstaerke * settings.volume;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  // Synthetischer Schrei: ein rauer, vibrierender Sägezahn durch drei
  // Formantfilter („aaah“), dazu Atemrauschen. Die Tonhöhe schnellt
  // hoch, kippt in der Mitte kurz weg und sackt am Ende ab.
  private synthSchrei(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const dauer = 1.3;
    const laut = CONFIG.audio.schreiLautstaerke * settings.volume;

    const summe = ctx.createGain();
    summe.gain.setValueAtTime(0.0001, t0);
    summe.gain.exponentialRampToValueAtTime(0.55 * laut + 0.0001, t0 + 0.05);
    summe.gain.setValueAtTime(0.55 * laut + 0.0001, t0 + dauer * 0.75);
    summe.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
    // Verzerrer für die Schärfe im Schrei
    const shaper = ctx.createWaveShaper();
    const kurve = new Float32Array(1024);
    for (let i = 0; i < kurve.length; i++) {
      const x = (i / (kurve.length - 1)) * 2 - 1;
      kurve[i] = Math.tanh(x * 3.2);
    }
    shaper.curve = kurve;
    shaper.connect(summe);
    summe.connect(ctx.destination);

    // Stimmbänder: zwei leicht verstimmte Sägezähne
    const stimme = ctx.createGain();
    stimme.gain.value = 0.5;
    const oszis: OscillatorNode[] = [];
    for (const detune of [0, 11]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      const f = osc.frequency;
      f.setValueAtTime(240, t0);
      f.exponentialRampToValueAtTime(820, t0 + 0.08); // Aufschrei
      f.exponentialRampToValueAtTime(690, t0 + 0.5);
      f.exponentialRampToValueAtTime(960, t0 + 0.62); // die Stimme kippt
      f.exponentialRampToValueAtTime(300, t0 + dauer);
      osc.connect(stimme);
      oszis.push(osc);
    }

    // Vibrato – ohne das klingt es nach Sirene, nicht nach Stimme
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 6.5;
    const vibratoTiefe = ctx.createGain();
    vibratoTiefe.gain.value = 38;
    vibrato.connect(vibratoTiefe);
    for (const osc of oszis) vibratoTiefe.connect(osc.frequency);

    // Formanten eines offenen „a“
    for (const [freq, q, pegel] of [
      [780, 9, 1.0],
      [1250, 10, 0.75],
      [2900, 12, 0.5],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = pegel;
      stimme.connect(bp).connect(g).connect(shaper);
    }

    // Atem: gefiltertes Rauschen, das mit der Stimme abklingt
    const len = Math.floor(ctx.sampleRate * dauer);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const daten = buf.getChannelData(0);
    for (let i = 0; i < len; i++) daten[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const rauschen = ctx.createBufferSource();
    rauschen.buffer = buf;
    const rauschFilter = ctx.createBiquadFilter();
    rauschFilter.type = 'bandpass';
    rauschFilter.frequency.value = 3200;
    rauschFilter.Q.value = 0.8;
    const rauschGain = ctx.createGain();
    rauschGain.gain.value = 0.18;
    rauschen.connect(rauschFilter).connect(rauschGain).connect(summe);

    for (const osc of oszis) {
      osc.start(t0);
      osc.stop(t0 + dauer);
    }
    vibrato.start(t0);
    vibrato.stop(t0 + dauer);
    rauschen.start(t0);
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
