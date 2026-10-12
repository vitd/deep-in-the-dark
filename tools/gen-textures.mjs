#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Erzeugt alle Spiel-Texturen lokal und deterministisch als PNG.
// Keine externen Abhängigkeiten: eigener PNG-Encoder (zlib + CRC32).
//
//   node tools/gen-textures.mjs
//
// Die Motive folgen der Art-Bible (docs/art-bible.md): begrenzte Palette,
// klare Motive, harte Kanten, kein Weichzeichnen. Die Texturen werden von
// src/rendering/Textures.ts nearest-gefiltert geladen und bleiben daher
// Pixel-Look-konform.
// ---------------------------------------------------------------------------

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const ZIEL = join(HIER, '..', 'public', 'assets', 'textures');

// ---- PNG-Encoder (RGBA8, Filter 0) ---------------------------------------

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABELLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])), 0);
  return Buffer.concat([kopf, daten, crc]);
}

function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Zeichenfläche --------------------------------------------------------

class Flaeche {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
  }
  setz(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = 255;
  }
  hol(x, y) {
    const i = ((y % this.h) * this.w + (x % this.w)) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
}

// ---- Farb- und Rauschhilfen ----------------------------------------------

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
function misch(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function runde(c) {
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wert-Rauschen mit bilinearer Interpolation und fbm
function wertRauschen(seed) {
  const rnd = mulberry(seed);
  const N = 64;
  const gitter = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) gitter[i] = rnd();
  const glatt = (t) => t * t * (3 - 2 * t);
  const wert = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = glatt(x - xi);
    const yf = glatt(y - yi);
    const gi = (a, b) => gitter[((b % N) + N) % N * N + (((a % N) + N) % N)];
    const a = gi(xi, yi);
    const b = gi(xi + 1, yi);
    const c = gi(xi, yi + 1);
    const d = gi(xi + 1, yi + 1);
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  };
  return (x, y, f) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += wert(x * f, y * f) * amp;
      norm += amp;
      f *= 2;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

// Bayer-4x4-Dithering: hält Farbverläufe im Pixel-Look körnig statt glatt.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => v / 16));

function dither(x, y, t) {
  return t + (BAYER[y & 3][x & 3] - 0.5) * 0.12;
}

// Palettierte Farbwahl mit Dithering: stuft eine intensität 0..1 in
// gleichmäßige Bänder und wählt daraus die Palettenfarbe.
function stufe(x, y, t, palette) {
  const v = Math.max(0, Math.min(1, dither(x, y, t)));
  const i = Math.min(palette.length - 1, Math.floor(v * palette.length));
  return palette[i];
}

// ---- Texturen -------------------------------------------------------------

function stein(seed) {
  const S = 256;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const palette = [hex('#2c363d'), hex('#3a464f'), hex('#48555e'), hex('#57646d'), hex('#66747d')];
  const rnd = mulberry(seed + 7);
  // Felsbänder (Schichtung)
  const bandHoehe = 18 + Math.floor(rnd() * 10);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hell = rausch(x, y, 0.06) * 0.6 + rausch(x, y, 0.16) * 0.4;
      // Schichtung: dunkle Fugen zwischen Bänken
      const band = Math.floor((y + Math.sin(x * 0.08) * 3) / bandHoehe);
      if ((y + Math.sin(x * 0.08) * 3) % bandHoehe < 1.5) hell -= 0.35;
      hell += (rausch(x + band * 40, y, 0.1) - 0.5) * 0.25;
      // Feuchte, moosige Basis
      if (y > S * 0.72) hell -= (y / S - 0.72) * 1.4;
      f.setz(x, y, stufe(x, y, hell, palette));
    }
  }
  // Risse
  for (let k = 0; k < 26; k++) {
    let x = rnd() * S;
    let y = rnd() * S;
    const len = 20 + rnd() * 60;
    for (let s = 0; s < len; s++) {
      f.setz(Math.round(x), Math.round(y), hex('#1e262b'));
      x += (rnd() - 0.5) * 1.6;
      y += 0.6 + rnd() * 0.8;
    }
  }
  return f;
}

function sand(seed) {
  const S = 256;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const palette = [hex('#8a7753'), hex('#9c8a63'), hex('#ae9c74'), hex('#c0ad86'), hex('#cfbd97')];
  const rnd = mulberry(seed + 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hell = 0.45 + rausch(x, y, 0.25) * 0.4 + (rnd() - 0.5) * 0.18;
      // sanfte Wellenrippel
      hell += Math.sin((x * 0.9 + y * 0.5) * 0.06) * 0.06;
      f.setz(x, y, stufe(x, y, hell, palette));
    }
  }
  // dunkle Körner/Splitter und vereinzelte helle Muschelpunkte
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    f.setz(x, y, rnd() < 0.8 ? hex('#6f5f42') : hex('#e6dcc2'));
  }
  return f;
}

function plank(seed) {
  const S = 128;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const rnd = mulberry(seed + 11);
  const plankB = S / 4;
  for (let p = 0; p < 4; p++) {
    const basis = misch(hex('#7a5a38'), hex('#9c7a4e'), rnd());
    for (let y = 0; y < S; y++) {
      for (let x = p * plankB; x < (p + 1) * plankB; x++) {
        const lx = x - p * plankB;
        let t = 0.5 + rausch(lx, y, 0.09) * 0.35;
        // Holzmaserung: gestreckte Linien in y
        t += Math.sin(lx * 0.7 + rausch(lx, y, 0.03) * 8) * 0.06;
        const col = misch(basis, hex('#4f3a24'), 1 - Math.min(1, t));
        let c = col;
        // Fuge zur Nachbarplanke
        if (lx < 2) c = hex('#3a2a1a');
        f.setz(x, y, runde(c));
      }
    }
    // Nagelköpfe
    for (const ny of [6, S - 8]) {
      const nx = p * plankB + 5;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) f.setz(nx + dx, ny + dy, hex('#3a3026'));
      f.setz(nx, ny, hex('#8a8072'));
    }
  }
  return f;
}

function bootWand(seed) {
  const S = 128;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const rnd = mulberry(seed + 5);
  const grund = [hex('#66706b'), hex('#727c75'), hex('#7e8881'), hex('#8a948c')];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hell = 0.4 + rausch(x, y, 0.08) * 0.5;
      let c = stufe(x, y, hell, grund);
      // Plattenstöße alle 32 px + horizontale Nietenreihen
      if (x % 32 === 0 || x % 32 === 1) c = hex('#4a534d');
      if (y % 64 === 10 || y % 64 === 11) c = hex('#59635c');
      // Rostläufer
      const rost = rausch(x * 2 + 50, y, 0.05);
      if (rost > 0.66) c = misch(c, hex('#6b4630'), (rost - 0.66) * 2.2);
      f.setz(x, y, runde(c));
    }
  }
  // Nieten
  for (let y = 10; y < S; y += 64) {
    for (let x = 16; x < S; x += 32) {
      f.setz(x, y, hex('#9aa49c'));
      f.setz(x + 1, y, hex('#5a635c'));
      f.setz(x, y + 1, hex('#5a635c'));
    }
  }
  return f;
}

function fels(seed) {
  const S = 256;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const palette = [hex('#2b3339'), hex('#38424a'), hex('#46515a'), hex('#556169')];
  const rnd = mulberry(seed + 13);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hell = rausch(x, y, 0.07) * 0.55 + rausch(x, y, 0.2) * 0.45;
      // grobe Flecken statt Schichtung
      hell += (rausch(x + 17, y + 9, 0.035) - 0.5) * 0.4;
      f.setz(x, y, stufe(x, y, hell, palette));
    }
  }
  // kurze, krumme Risse
  for (let k = 0; k < 22; k++) {
    let x = rnd() * S;
    let y = rnd() * S;
    const len = 14 + rnd() * 46;
    const dir = rnd() * Math.PI;
    for (let s = 0; s < len; s++) {
      f.setz(Math.round(x), Math.round(y), hex('#1d2429'));
      x += Math.cos(dir) + (rnd() - 0.5) * 1.2;
      y += Math.sin(dir) + (rnd() - 0.5) * 1.2;
    }
  }
  return f;
}

function tempel(seed) {
  const S = 256;
  const block = 64;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const palette = [hex('#4a5058'), hex('#565d66'), hex('#626a73'), hex('#6e7680')];
  const rnd = mulberry(seed + 21);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      f.setz(x, y, stufe(x, y, 0.4 + rausch(x, y, 0.1) * 0.5, palette));
    }
  }
  // Behauene Blöcke: Fugen, Kantenlicht, eingemeißelte Glyphe
  for (let by = 0; by < S; by += block) {
    for (let bx = 0; bx < S; bx += block) {
      for (let i = 0; i < 2; i++) {
        for (let x = bx; x < bx + block; x++) f.setz(x, by + i, hex('#2f353b'));
        for (let y = by; y < by + block; y++) f.setz(bx + i, y, hex('#2f353b'));
      }
      for (let x = bx + 2; x < bx + block; x++) f.setz(x, by + 2, hex('#7d858f'));
      for (let y = by + 2; y < by + block; y++) f.setz(bx + 2, y, hex('#7d858f'));
      for (let x = bx + 2; x < bx + block; x++) f.setz(x, by + block - 1, hex('#3c4249'));
      for (let y = by + 2; y < by + block; y++) f.setz(bx + block - 1, y, hex('#3c4249'));
      const cx = bx + block / 2;
      const cy = by + block / 2;
      if (rnd() < 0.7) {
        for (let k = -8; k <= 8; k++) {
          f.setz(cx + k, cy, hex('#333a41'));
          f.setz(cx, cy + k, hex('#333a41'));
        }
        for (let k = -4; k <= 4; k++) {
          f.setz(cx + k, cy - 4, hex('#333a41'));
          f.setz(cx + k, cy + 4, hex('#333a41'));
        }
      }
    }
  }
  // Verwitterung und Moos
  for (let i = 0; i < 1400; i++) {
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    if (rnd() < 0.5) f.setz(x, y, hex('#2b3a33'));
  }
  return f;
}

function kaustik(seed) {
  const S = 256;
  const f = new Flaeche(S, S);
  const TAU = Math.PI * 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // zwei gekreuzte, ganzzahlige Wellensysteme -> kachelbar;
      // hoch potenziert entsteht ein helles Netz dünner Linien
      const a1 = Math.sin(TAU * 3 * u + 1.4 * Math.sin(TAU * 2 * v));
      const b1 = Math.sin(TAU * 2 * v + 1.4 * Math.sin(TAU * 3 * u));
      const o1 = Math.abs(a1 * b1);
      const a2 = Math.sin(TAU * 5 * u + 1.2 * Math.sin(TAU * 3 * v));
      const b2 = Math.sin(TAU * 4 * v + 1.2 * Math.sin(TAU * 4 * u));
      const o2 = Math.abs(a2 * b2);
      let c = Math.pow(1 - o1, 11) * 0.7 + Math.pow(1 - o2, 15) * 0.5;
      c = Math.max(0, Math.min(1, c));
      const g = Math.round(c * 255);
      f.setz(x, y, [g, g, g]);
    }
  }
  return f;
}

function tuer(seed) {
  const S = 128;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  const rnd = mulberry(seed + 9);
  const grund = [hex('#556058'), hex('#616c63'), hex('#6d786e')];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let c = stufe(x, y, 0.35 + rausch(x, y, 0.07) * 0.5, grund);
      // Rahmen
      const rand = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (rand < 6) c = rampe(rand, [hex('#39423c'), hex('#4a544d')]);
      // Querstreben
      if (Math.abs(x - y) < 3 || Math.abs(x - (S - 1 - y)) < 3) c = hex('#3d4a42');
      f.setz(x, y, runde(c));
    }
  }
  // Griff (goldener Ring) rechts
  const hx = S - 26;
  const hy = S / 2;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    for (let r = 6; r <= 8; r += 0.5) {
      f.setz(Math.round(hx + Math.cos(a) * r), Math.round(hy + Math.sin(a) * r), hex('#c9a24a'));
    }
  }
  return f;
}

function rampe(v, palette) {
  const i = Math.max(0, Math.min(palette.length - 1, Math.round(v)));
  return palette[i];
}

function wasser(seed) {
  const S = 256;
  const f = new Flaeche(S, S);
  const rausch = wertRauschen(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let t = rausch(x, y, 0.03) * 0.6 + rausch(x, y, 0.12) * 0.4;
      // langgezogene Wellenkämme
      t += Math.sin((x * 0.6 + rausch(x, y, 0.05) * 6) * 0.12) * 0.15;
      const c = misch(hex('#255f6c'), hex('#79c6ce'), Math.max(0, Math.min(1, t)));
      f.setz(x, y, runde(c));
    }
  }
  // schaumige Kämme
  const rnd = mulberry(seed + 2);
  for (let k = 0; k < 260; k++) {
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    f.setz(x, y, hex('#cfeef2'));
  }
  return f;
}

const TEXTUREN = {
  'stone.png': stein(101),
  'rock.png': fels(151),
  'temple.png': tempel(171),
  'caustic.png': kaustik(181),
  'sand.png': sand(202),
  'plank.png': plank(303),
  'boat-wall.png': bootWand(404),
  'door.png': tuer(505),
  'water.png': wasser(606),
};

mkdirSync(ZIEL, { recursive: true });
for (const [name, flaeche] of Object.entries(TEXTUREN)) {
  const datei = join(ZIEL, name);
  writeFileSync(datei, png(flaeche.w, flaeche.h, flaeche.px));
  console.log(`  ✓ ${name} (${flaeche.w}×${flaeche.h})`);
}
console.log('Texturen erzeugt in', ZIEL);
