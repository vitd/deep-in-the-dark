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

  // Synthetischer Schrei. Ein einzelner Sägezahn mit Vibrato klingt nach
  // Sirene – furchterregend wird es erst durch Schichten, die sich
  // gegenseitig zerreißen:
  //
  // 1. Aufprall: Sub-Bass-Schlag und ein Rauschknall im ersten Zehntel,
  //    damit der Körper erschrickt, bevor das Ohr die Stimme einordnet
  // 2. Stimme: drei gegeneinander verstimmte Sägezähne. Die Tonhöhe
  //    schießt hoch, bricht mehrfach (die Stimme „kippt“) und wird
  //    zusätzlich von tiefpassgefiltertem Rauschen hin- und hergerissen –
  //    eine glatte Stimme wirkt künstlich, eine zerrissene panisch.
  //    Ein Knatter-LFO um 25–40 Hz zerhackt die Lautstärke (Kehlkopf-
  //    Rasseln), die Formanten wandern vom offenen „a“ ins gepresste
  //    Kreisch-„ä“, am Ende ein harter Verzerrer.
  // 3. Kreischen: eine Oktave darüber, kommt verzögert dazu und zittert
  // 4. Grollen: Subharmonische (halbe Tonhöhe) als Rechteck – das macht
  //    den Schrei unmenschlich
  // 5. Raum: Faltungshall aus abklingendem Rauschen und ein Kompressor,
  //    der alles zusammenpresst und den Pegel hält
  private synthSchrei(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const dauer = 2.4;
    const laut = CONFIG.audio.schreiLautstaerke * settings.volume;
    const sr = ctx.sampleRate;

    // Ausgang: Kompressor -> Master; daneben der Hall
    const master = ctx.createGain();
    master.gain.value = laut;
    const komp = ctx.createDynamicsCompressor();
    komp.threshold.value = -18;
    komp.knee.value = 12;
    komp.ratio.value = 8;
    komp.attack.value = 0.003;
    komp.release.value = 0.15;
    komp.connect(master).connect(ctx.destination);

    const hall = ctx.createConvolver();
    const hallLen = Math.floor(sr * 1.8);
    const ir = ctx.createBuffer(2, hallLen, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < hallLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp((-i / sr) * 3.5);
      }
    }
    hall.buffer = ir;
    const hallGain = ctx.createGain();
    hallGain.gain.value = 0.55;
    hall.connect(hallGain).connect(komp);

    // Summenpunkt aller Schichten; Hüllkurve über den ganzen Schrei
    const summe = ctx.createGain();
    summe.gain.setValueAtTime(0.0001, t0);
    summe.gain.exponentialRampToValueAtTime(1, t0 + 0.04);
    summe.gain.setValueAtTime(1, t0 + dauer * 0.7);
    summe.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
    summe.connect(komp);
    summe.connect(hall);

    const rauschBuffer = (sekunden: number): AudioBuffer => {
      const len = Math.floor(sr * sekunden);
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    };
    const quellen: AudioScheduledSourceNode[] = [];

    // ---- 1. Aufprall ----
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(70, t0);
    thud.frequency.exponentialRampToValueAtTime(28, t0 + 0.5);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(1.1, t0);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
    thud.connect(thudGain).connect(summe);
    quellen.push(thud);

    const knall = ctx.createBufferSource();
    knall.buffer = rauschBuffer(0.3);
    const knallFilter = ctx.createBiquadFilter();
    knallFilter.type = 'highpass';
    knallFilter.frequency.value = 1200;
    const knallGain = ctx.createGain();
    knallGain.gain.setValueAtTime(0.7, t0);
    knallGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    knall.connect(knallFilter).connect(knallGain).connect(summe);
    quellen.push(knall);

    // ---- 2. Stimme ----
    // Verzerrer (hart) hinter den Formanten
    const shaper = ctx.createWaveShaper();
    const kurve = new Float32Array(2048);
    for (let i = 0; i < kurve.length; i++) {
      const x = (i / (kurve.length - 1)) * 2 - 1;
      kurve[i] = Math.tanh(x * 6);
    }
    shaper.curve = kurve;
    shaper.oversample = '2x';
    const shaperGain = ctx.createGain();
    shaperGain.gain.value = 0.6;
    shaper.connect(shaperGain).connect(summe);

    // Kehlkopf-Rasseln: zerhackt die Stimme mit 25–40 Hz
    const stimme = ctx.createGain();
    stimme.gain.value = 0.55;
    const rassel = ctx.createOscillator();
    rassel.type = 'square';
    rassel.frequency.setValueAtTime(24, t0);
    rassel.frequency.linearRampToValueAtTime(40, t0 + 1.2);
    rassel.frequency.linearRampToValueAtTime(19, t0 + dauer);
    const rasselTiefe = ctx.createGain();
    rasselTiefe.gain.value = 0.4;
    rassel.connect(rasselTiefe).connect(stimme.gain);
    quellen.push(rassel);

    // Tonhöhenverlauf: Aufschrei, zweimal kippen, am Ende absacken
    const tonhoehe = (f: AudioParam, k: number) => {
      f.setValueAtTime(170 * k, t0);
      f.exponentialRampToValueAtTime(1050 * k, t0 + 0.12);
      f.exponentialRampToValueAtTime(920 * k, t0 + 0.55);
      f.exponentialRampToValueAtTime(1480 * k, t0 + 0.68); // kippt
      f.exponentialRampToValueAtTime(1180 * k, t0 + 1.05);
      f.exponentialRampToValueAtTime(1650 * k, t0 + 1.18); // kippt erneut
      f.exponentialRampToValueAtTime(760 * k, t0 + 1.9);
      f.exponentialRampToValueAtTime(210 * k, t0 + dauer);
    };

    // Zerrissene Tonhöhe: Rauschen als Frequenzmodulation, erst zaghaft,
    // dann immer heftiger
    const zitter = ctx.createBufferSource();
    zitter.buffer = rauschBuffer(dauer);
    const zitterFilter = ctx.createBiquadFilter();
    zitterFilter.type = 'lowpass';
    zitterFilter.frequency.value = 45;
    const zitterTiefe = ctx.createGain();
    zitterTiefe.gain.setValueAtTime(15, t0);
    zitterTiefe.gain.linearRampToValueAtTime(140, t0 + 1.0);
    zitterTiefe.gain.linearRampToValueAtTime(260, t0 + dauer);
    zitter.connect(zitterFilter).connect(zitterTiefe);
    quellen.push(zitter);

    // Vibrato, das im Verlauf schneller und tiefer wird (Panik)
    const vibrato = ctx.createOscillator();
    vibrato.frequency.setValueAtTime(5.5, t0);
    vibrato.frequency.linearRampToValueAtTime(9, t0 + dauer);
    const vibratoTiefe = ctx.createGain();
    vibratoTiefe.gain.setValueAtTime(20, t0);
    vibratoTiefe.gain.linearRampToValueAtTime(70, t0 + dauer);
    vibrato.connect(vibratoTiefe);
    quellen.push(vibrato);

    for (const detune of [0, 14, -9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      tonhoehe(osc.frequency, 1);
      zitterTiefe.connect(osc.frequency);
      vibratoTiefe.connect(osc.frequency);
      osc.connect(stimme);
      quellen.push(osc);
    }

    // Formanten: vom offenen „a“ ins gepresste, hohe Kreisch-„ä“
    for (const [f1, f2, q, pegel] of [
      [720, 1050, 8, 1.0],
      [1150, 1750, 9, 0.85],
      [2650, 3400, 11, 0.7],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f1, t0);
      bp.frequency.exponentialRampToValueAtTime(f2, t0 + 0.7);
      bp.frequency.exponentialRampToValueAtTime(f1, t0 + dauer);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = pegel;
      stimme.connect(bp).connect(g).connect(shaper);
    }

    // Heiserer Anteil: Rauschen, das der Stimme folgt
    const atem = ctx.createBufferSource();
    atem.buffer = rauschBuffer(dauer);
    const atemFilter = ctx.createBiquadFilter();
    atemFilter.type = 'bandpass';
    atemFilter.frequency.setValueAtTime(2400, t0);
    atemFilter.frequency.exponentialRampToValueAtTime(3600, t0 + 0.7);
    atemFilter.Q.value = 1.2;
    const atemGain = ctx.createGain();
    atemGain.gain.setValueAtTime(0.25, t0);
    atemGain.gain.linearRampToValueAtTime(0.45, t0 + dauer);
    atem.connect(atemFilter).connect(atemGain).connect(shaper);
    quellen.push(atem);

    // ---- 3. Kreischen (Oktave darüber, kommt verzögert) ----
    const kreisch = ctx.createOscillator();
    kreisch.type = 'sawtooth';
    kreisch.detune.value = 7;
    tonhoehe(kreisch.frequency, 2);
    zitterTiefe.connect(kreisch.frequency);
    const kreischFilter = ctx.createBiquadFilter();
    kreischFilter.type = 'bandpass';
    kreischFilter.frequency.value = 3200;
    kreischFilter.Q.value = 1.5;
    const kreischGain = ctx.createGain();
    kreischGain.gain.setValueAtTime(0.0001, t0);
    kreischGain.gain.setValueAtTime(0.0001, t0 + 0.35);
    kreischGain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.7);
    kreischGain.gain.setValueAtTime(0.5, t0 + 1.6);
    kreischGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 11;
    const tremoloTiefe = ctx.createGain();
    tremoloTiefe.gain.value = 0.25;
    tremolo.connect(tremoloTiefe).connect(kreischGain.gain);
    kreisch.connect(kreischFilter).connect(kreischGain).connect(shaper);
    quellen.push(kreisch, tremolo);

    // ---- 4. Grollen (Subharmonische) ----
    const groll = ctx.createOscillator();
    groll.type = 'square';
    tonhoehe(groll.frequency, 0.5);
    zitterTiefe.connect(groll.frequency);
    const grollFilter = ctx.createBiquadFilter();
    grollFilter.type = 'lowpass';
    grollFilter.frequency.value = 420;
    const grollGain = ctx.createGain();
    grollGain.gain.setValueAtTime(0.3, t0);
    grollGain.gain.linearRampToValueAtTime(0.5, t0 + dauer);
    groll.connect(grollFilter).connect(grollGain).connect(shaper);
    quellen.push(groll);

    for (const q of quellen) {
      q.start(t0);
      q.stop(t0 + dauer + 0.05);
    }
  }

  // Eine Falle im Tiefentempel trifft: metallisches Klirren mit
  // dumpfem Schlag, gedämpft wie unter Wasser (synthetisch)
  falle(): void {
    try {
      this.ctx = this.ctx ?? new AudioContext();
      const ctx = this.ctx;
      ctx.resume().catch(() => {});
      const t0 = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.5 * settings.volume;
      const tief = ctx.createBiquadFilter();
      tief.type = 'lowpass';
      tief.frequency.value = 2400;
      tief.connect(out).connect(ctx.destination);

      // Klirren: zwei unharmonische Teiltöne, schnell abklingend
      for (const [f, g] of [[620, 0.5], [1410, 0.3]] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(f * 0.8, t0 + 0.5);
        const env = ctx.createGain();
        env.gain.setValueAtTime(g, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
        osc.connect(env).connect(tief);
        osc.start(t0);
        osc.stop(t0 + 0.6);
      }
      // Schlag: kurzer Rauschstoß
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nEnv = ctx.createGain();
      nEnv.gain.value = 0.8;
      noise.connect(nEnv).connect(tief);
      noise.start(t0);
    } catch {
      // Audio nicht verfügbar – Spiel läuft stumm weiter
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
