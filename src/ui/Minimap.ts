import { CONFIG } from '../config';
import { insideLake, lakeFloorY } from '../world/lake';

// Minimap oben rechts: kreisrunder Kartenausschnitt mit festem Radius
// (CONFIG.minimap.radius), Spieler immer im Zentrum, seine Blickrichtung
// immer oben. Gezeichnet wird auf ein kleines Canvas, das per CSS
// nearest-neighbor hochskaliert wird – damit bleibt die Karte im
// Pixel-Look des Spiels.
//
// Zwei Ebenen:
//
// 1. Der Meeresboden. Er kommt aus derselben Funktion wie die echte
//    Geometrie (lakeFloorY), wird also nie "falsch" – Rücken, Kuppen
//    und die tiefe Seemitte sind wiederzuerkennen. Weil das Abtasten
//    zu teuer für jedes Bild ist, entsteht daraus ein achsenparalleler
//    Geländepuffer rund um den Spieler, der nur alle paar Meter neu
//    aufgebaut (und dabei über mehrere Frames verteilt) wird. Pro Bild
//    wird er nur noch gedreht darüberkopiert.
//
// 2. Die beweglichen Marken (Schiff, Hai, Seemonster, Boss). Sie kommen
//    direkt aus der Welt und werden jedes Bild neu gezeichnet.

const M = CONFIG.minimap;

const PX = M.pixel; // interne Kantenlänge des Canvas
const SCALE = PX / 2 / M.radius; // Bildpunkte je Meter
const STEP = 1 / SCALE; // Meter je Geländetexel – so blittet 1:1

// Kantenlänge des Geländepuffers. Er muss den Kartenradius plus den
// Weg abdecken, den der Spieler bis zum nächsten Neuaufbau zurücklegt.
const N = 145;
const HALF = (N - 1) / 2;
const REBUILD_DIST = 12; // Neuaufbau, sobald der Spieler so weit weg ist
const ROWS_PER_FRAME = 24; // Zeilen je Bild – verteilt die Rechenlast

// Tiefen-Farbverlauf: sandiger Schelf -> Türkis -> tiefes Schwarzblau.
const DEPTH_RAMP: { d: number; c: [number, number, number] }[] = [
  { d: 6, c: [0x9f, 0xa9, 0x8a] },
  { d: 14, c: [0x6a, 0x9c, 0x92] },
  { d: 28, c: [0x3e, 0x76, 0x83] },
  { d: 50, c: [0x2a, 0x56, 0x66] },
  { d: 75, c: [0x1a, 0x40, 0x50] },
  { d: 110, c: [0x0e, 0x28, 0x36] },
];
const CLIFF: [number, number, number] = [0x4a, 0x42, 0x36]; // Steilküste
const CONTOUR = 10; // Tiefenlinie alle x Meter
const SHADE_GAIN = 15; // Stärke der Reliefschattierung

// Farben der Marken
const COL = {
  ship: '#e8e0c8',
  shark: '#d8883c',
  monster: '#c84a3c',
  boss: '#ff3c2a',
  player: '#ffe9a8',
  dark: 'rgba(4, 10, 14, 0.85)',
  north: '#9fd4e0',
};

export type MinimapKind = 'ship' | 'shark' | 'monster' | 'boss';

export interface MinimapMark {
  kind: MinimapKind;
  x: number;
  z: number;
  // Weltgier; Vorwärts ist wie bei Spieler und Boot (-sin, -cos).
  yaw: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  // fertiger Geländepuffer + sein Mittelpunkt in Weltkoordinaten
  private readonly terrain: HTMLCanvasElement;
  private readonly terrainCtx: CanvasRenderingContext2D;
  private terrainX = 0;
  private terrainZ = 0;
  // Aufbau, der gerade läuft (buildRow < 0: keiner)
  private readonly pending: ImageData;
  private buildX = 0;
  private buildZ = 0;
  private buildRow = -1;
  private readonly prevRow = new Float32Array(N);
  private ready = false;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = PX;
    canvas.height = PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap: kein 2D-Kontext');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.terrain = document.createElement('canvas');
    this.terrain.width = N;
    this.terrain.height = N;
    const tctx = this.terrain.getContext('2d');
    if (!tctx) throw new Error('Minimap: kein 2D-Kontext');
    this.terrainCtx = tctx;
    this.pending = tctx.createImageData(N, N);
  }

  // ---------- Geländepuffer ----------

  private startBuild(px: number, pz: number): void {
    // Mittelpunkt aufs Texelraster rasten: derselbe Fleck Seeboden
    // liefert dann immer dieselben Texel, die Karte flimmert nicht.
    this.buildX = Math.round(px / STEP) * STEP;
    this.buildZ = Math.round(pz / STEP) * STEP;
    this.buildRow = 0;
  }

  // Baut `rows` Zeilen des Puffers. Ist er fertig, wird er sichtbar.
  private buildRows(rows: number): void {
    const data = this.pending.data;
    const end = Math.min(N, this.buildRow + rows);

    for (let j = this.buildRow; j < end; j++) {
      const wz = this.buildZ + (j - HALF) * STEP;
      let west = 0; // Bodenhöhe des linken Nachbarn
      for (let i = 0; i < N; i++) {
        const wx = this.buildX + (i - HALF) * STEP;
        const o = (j * N + i) * 4;
        const h = lakeFloorY(wx, wz);

        if (!insideLake(wx, wz, 0)) {
          // jenseits der Steilküste: Fels, leicht aufgeraut
          const n = ((i * 7 + j * 13) % 5) - 2;
          data[o] = CLIFF[0] + n * 4;
          data[o + 1] = CLIFF[1] + n * 4;
          data[o + 2] = CLIFF[2] + n * 4;
          data[o + 3] = 255;
          this.prevRow[i] = h;
          west = h;
          continue;
        }

        const depth = CONFIG.world.seaLevel - h;
        // Reliefschattierung: Licht von Nordwest. Hänge, die zum Licht
        // ansteigen, werden heller – so treten Rücken und Kuppen hervor.
        // prevRow enthält beim Lesen noch Zeile j-1 (auch über eine
        // Slice-Grenze hinweg), erst danach wird sie überschrieben
        const north = j > 0 ? this.prevRow[i] : h;
        const slope = (i > 0 ? h - west : 0) + (h - north);
        // Das Relief wird mit der Wassertiefe größer (siehe lake.ts):
        // am flachen Schelf sind es Zentimeter, in der Seemitte Meter.
        // Ohne Normierung wäre der Schelf spiegelglatt und die Tiefe ein
        // Rauschteppich – geteilt durch die örtliche Reliefhöhe zeigen
        // beide Zonen gleich viel Struktur.
        const amp = clamp((depth - 4) * 0.55, 1.2, 34);
        // Die Steigungen sind extrem ungleich verteilt (die Rücken aus
        // dem Ridged Noise haben scharfe Grate): die Wurzelkennlinie
        // hebt die vielen flachen Hänge an, ohne dass die Grate zu
        // harten Farbstufen ausbrennen.
        const t = Math.abs(slope / amp) * SHADE_GAIN;
        let shade = 1 + Math.sign(slope) * 0.5 * Math.min(1, Math.pow(t, 0.6));
        // Tiefenlinien betonen die Struktur zusätzlich. Geprüft wird
        // gegen beide Nachbarn, sonst zerfallen sie zu Punktreihen.
        const band = Math.floor(depth / CONTOUR);
        if (
          (i > 0 && band !== Math.floor((CONFIG.world.seaLevel - west) / CONTOUR)) ||
          (j > 0 && band !== Math.floor((CONFIG.world.seaLevel - north) / CONTOUR))
        ) {
          shade *= 0.82;
        }

        const c = rampColor(depth);
        data[o] = clamp(c[0] * shade, 0, 255);
        data[o + 1] = clamp(c[1] * shade, 0, 255);
        data[o + 2] = clamp(c[2] * shade, 0, 255);
        data[o + 3] = 255;
        this.prevRow[i] = h;
        west = h;
      }
    }

    this.buildRow = end;
    if (this.buildRow >= N) {
      this.terrainCtx.putImageData(this.pending, 0, 0);
      this.terrainX = this.buildX;
      this.terrainZ = this.buildZ;
      this.buildRow = -1;
      this.ready = true;
    }
  }

  private updateTerrain(px: number, pz: number): void {
    if (this.buildRow < 0) {
      const moved = Math.hypot(px - this.terrainX, pz - this.terrainZ);
      if (this.ready && moved <= REBUILD_DIST) return;
      this.startBuild(px, pz);
    }
    // Der allererste Puffer entsteht in einem Rutsch, damit im ersten
    // Bild schon eine Karte steht; danach wird die Last verteilt.
    this.buildRows(this.ready ? ROWS_PER_FRAME : N);
  }

  // ---------- Zeichnen ----------

  // `yaw` ist die Blickrichtung des Spielers; sie zeigt auf der Karte
  // immer nach oben.
  render(px: number, pz: number, yaw: number, marks: readonly MinimapMark[]): void {
    this.updateTerrain(px, pz);

    const ctx = this.ctx;
    const r = PX / 2;
    ctx.clearRect(0, 0, PX, PX);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip();

    // Weltkoordinaten (x, z) werden in dieser Transformation direkt zu
    // Bildkoordinaten: Osten rechts, Süden unten – gedreht um yaw,
    // damit die Blickrichtung oben liegt.
    ctx.translate(r, r);
    ctx.rotate(yaw);
    ctx.scale(SCALE, SCALE);
    ctx.translate(-px, -pz);

    if (this.ready) {
      const left = this.terrainX - (HALF + 0.5) * STEP;
      const top = this.terrainZ - (HALF + 0.5) * STEP;
      ctx.drawImage(this.terrain, left, top, N * STEP, N * STEP);
    }

    for (const m of marks) this.drawMark(ctx, m, px, pz);
    ctx.restore();

    // Spieler und Randmarken liegen über der Karte, aber ohne Drehung
    ctx.save();
    ctx.translate(r, r);
    this.drawPlayer(ctx);
    this.drawNorth(ctx, yaw);
    ctx.restore();
  }

  // Eine Weltmarke. Gezeichnet wird im gedrehten Kartenrahmen, die
  // Formen werden deshalb um die Weltgier zurückgedreht und in Metern
  // (nicht Pixeln) aufgebaut.
  private drawMark(ctx: CanvasRenderingContext2D, m: MinimapMark, px: number, pz: number): void {
    const dist = Math.hypot(m.x - px, m.z - pz);
    const u = STEP; // ein Kartenpixel in Metern

    if (dist > M.radius) {
      // Nur das Schiff bleibt sichtbar: als kleine Marke am Kartenrand,
      // damit man den Rückweg nicht verliert.
      if (m.kind !== 'ship') return;
      const k = (M.radius - 4 * u) / dist;
      ctx.save();
      ctx.translate(px + (m.x - px) * k, pz + (m.z - pz) * k);
      ctx.fillStyle = COL.ship;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, 2 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(m.x, m.z);
    ctx.rotate(-m.yaw); // Marke zeigt danach mit ihrer Nase nach vorn
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = u;

    if (m.kind === 'ship') {
      // Rumpfform in echten Metern: 8 m breit, 24 m lang, Bug nach oben
      ctx.fillStyle = COL.ship;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(4, -4);
      ctx.lineTo(4, 12);
      ctx.lineTo(-4, 12);
      ctx.lineTo(-4, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Monster: Pfeilspitze in Fahrtrichtung, Größe nach Gefahr
      const s = m.kind === 'boss' ? 7 * u : m.kind === 'monster' ? 5 * u : 3.5 * u;
      ctx.fillStyle = m.kind === 'boss' ? COL.boss : m.kind === 'monster' ? COL.monster : COL.shark;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.85, s * 0.8);
      ctx.lineTo(0, s * 0.35);
      ctx.lineTo(-s * 0.85, s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Spieler: kleiner Pfeil in der Mitte, zeigt immer nach oben
  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COL.player;
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.5, 4);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(-3.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Nordmarke am Kartenrand: dreht mit, damit trotz mitdrehender Karte
  // klar bleibt, wo Norden (-z) liegt.
  private drawNorth(ctx: CanvasRenderingContext2D, yaw: number): void {
    ctx.save();
    // Norden ist -z; im Kartenrahmen liegt er bei Winkel yaw von oben.
    // Als Bogenstück am Rand ist die Marke nicht mit einem Monster zu
    // verwechseln.
    ctx.rotate(yaw);
    ctx.strokeStyle = COL.north;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, PX / 2 - 2, -Math.PI / 2 - 0.26, -Math.PI / 2 + 0.26);
    ctx.stroke();
    ctx.restore();
  }
}

// Farbe zur Wassertiefe (linear zwischen den Stützstellen)
function rampColor(depth: number): [number, number, number] {
  const r = DEPTH_RAMP;
  if (depth <= r[0].d) return r[0].c;
  for (let i = 1; i < r.length; i++) {
    if (depth <= r[i].d) {
      const t = (depth - r[i - 1].d) / (r[i].d - r[i - 1].d);
      const a = r[i - 1].c;
      const b = r[i].c;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return r[r.length - 1].c;
}
