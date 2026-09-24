import { CONFIG } from '../config';
import {
  AUSSEN, INNEN, MITTE, N, PLAN, TOR_BREITE, WAND, imRaum, linie, zellMitte, zuWelt,
} from '../world/TempelPlan';

// Karte des Tiefentempels (Cheat): der ganze Grundriss auf einen Blick –
// Außenwand mit Tor, Umgang, jede Labyrinthwand, die Schatzkammer, alle
// Luftblasen und Fallen, dazu der Spieler als Pfeil in Blickrichtung.
//
// Norden ist oben, wie auf der Minimap; der Tempel liegt so gedreht, wie
// er in der Welt steht (CONFIG.tiefentempel.torRichtung). Der Grundriss
// wird einmal in einen Puffer gezeichnet, pro Bild kommt nur der Pfeil
// dazu. Ist der Spieler außerhalb, klebt der Pfeil am Kartenrand und
// die Entfernung zum Tempel steht darunter.

const T = CONFIG.tiefentempel;
const PX_JE_M = 3; // interne Auflösung; per CSS pixelig hochskaliert
const RAND = 4; // Meter Luft um die Außenwand
const WELT_HALB = AUSSEN + RAND;
const GROESSE = Math.round(WELT_HALB * 2 * PX_JE_M);

const COL = {
  wasser: '#0b2430',
  boden: '#3a4a4c',
  wand: '#c8c0b0',
  aussen: '#8a7f6c',
  kammer: 'rgba(216, 176, 72, 0.45)',
  luft: '#9fd4e0',
  falle: '#e0503c',
  spieler: '#ffe9a8',
  dunkel: 'rgba(4, 10, 14, 0.9)',
};

export class LabyrinthKarte {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly basis: HTMLCanvasElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly info: HTMLElement,
  ) {
    canvas.width = GROESSE;
    canvas.height = GROESSE;
    this.ctx = canvas.getContext('2d')!;
    this.basis = document.createElement('canvas');
    this.basis.width = GROESSE;
    this.basis.height = GROESSE;
    this.zeichneGrundriss(this.basis.getContext('2d')!);
  }

  // Welt (x, z) -> Karte (u, v); Norden (-z) oben
  private u(x: number): number {
    return (x - T.x + WELT_HALB) * PX_JE_M;
  }

  private v(z: number): number {
    return (z - T.z + WELT_HALB) * PX_JE_M;
  }

  // Achsenparalleles Rechteck in lokalen Tempelkoordinaten füllen
  private rechteck(g: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number): void {
    const a = zuWelt(x0, z0);
    const b = zuWelt(x1, z1);
    const u0 = this.u(Math.min(a.x, b.x));
    const v0 = this.v(Math.min(a.z, b.z));
    const u1 = this.u(Math.max(a.x, b.x));
    const v1 = this.v(Math.max(a.z, b.z));
    g.fillRect(Math.floor(u0), Math.floor(v0), Math.max(1, Math.round(u1 - u0)), Math.max(1, Math.round(v1 - v0)));
  }

  private punkt(g: CanvasRenderingContext2D, lx: number, lz: number, r: number): void {
    const w = zuWelt(lx, lz);
    g.beginPath();
    g.arc(this.u(w.x), this.v(w.z), r, 0, Math.PI * 2);
    g.fill();
  }

  private zeichneGrundriss(g: CanvasRenderingContext2D): void {
    g.fillStyle = COL.wasser;
    g.fillRect(0, 0, GROESSE, GROESSE);

    // Außenwand, darin der begehbare Boden
    g.fillStyle = COL.aussen;
    this.rechteck(g, -AUSSEN, -AUSSEN, AUSSEN, AUSSEN);
    g.fillStyle = COL.boden;
    this.rechteck(g, -INNEN, -INNEN, INNEN, INNEN);
    // Tor vorn in der Mitte (lokal -z)
    this.rechteck(g, -TOR_BREITE / 2, -AUSSEN - 0.5, TOR_BREITE / 2, -INNEN);

    // Schatzkammer
    g.fillStyle = COL.kammer;
    this.rechteck(g, linie(MITTE - 1), linie(MITTE - 1), linie(MITTE + 2), linie(MITTE + 2));

    // Labyrinthwände und Pfosten
    const h = WAND / 2;
    g.fillStyle = COL.wand;
    for (let li = 0; li <= N; li++) {
      for (let j = 0; j < N; j++) {
        if (PLAN.wandV(li, j)) this.rechteck(g, linie(li) - h, linie(j), linie(li) + h, linie(j + 1));
      }
    }
    for (let i = 0; i < N; i++) {
      for (let lj = 0; lj <= N; lj++) {
        if (PLAN.wandH(i, lj)) this.rechteck(g, linie(i), linie(lj) - h, linie(i + 1), linie(lj) + h);
      }
    }
    for (let li = 0; li <= N; li++) {
      for (let lj = 0; lj <= N; lj++) {
        if (PLAN.pfosten(li, lj)) this.rechteck(g, linie(li) - h, linie(lj) - h, linie(li) + h, linie(lj) + h);
      }
    }

    // Luftblasen (hellblau) und Fallen (rot)
    g.fillStyle = COL.luft;
    for (const l of PLAN.luft) this.punkt(g, l.x, l.z, 2.2);
    g.fillStyle = COL.falle;
    for (const f of PLAN.fallen) {
      if (imRaum(f.i, f.j)) continue;
      this.punkt(g, zellMitte(f.i), zellMitte(f.j), 1.8);
    }
  }

  // Pro Bild, solange die Karte sichtbar ist
  render(px: number, pz: number, yaw: number): void {
    const g = this.ctx;
    g.drawImage(this.basis, 0, 0);

    let u = this.u(px);
    let v = this.v(pz);
    const draussen = u < 0 || v < 0 || u > GROESSE || v > GROESSE;
    if (draussen) {
      // am Kartenrand festhalten, in Richtung des Spielers
      const m = GROESSE / 2;
      const k = (m - 4) / Math.max(Math.abs(u - m), Math.abs(v - m));
      u = m + (u - m) * k;
      v = m + (v - m) * k;
      const d = Math.hypot(px - T.x, pz - T.z) - AUSSEN;
      this.info.textContent = `Tempel: ${Math.max(0, Math.round(d))} m entfernt`;
    } else {
      this.info.textContent = 'Tiefentempel';
    }

    g.save();
    g.translate(Math.round(u), Math.round(v));
    g.rotate(-yaw); // Pfeilspitze zeigt in Blickrichtung
    g.fillStyle = COL.spieler;
    g.strokeStyle = COL.dunkel;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(0, 2);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

