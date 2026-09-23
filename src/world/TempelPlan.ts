import { CONFIG } from '../config';

// Grundriss des Tiefentempels – reine Daten, ohne Three.js. Hier
// entstehen das Labyrinth, die Luftblasen und die Fallenplätze; die
// Geometrie baut Tiefentempel.ts daraus.
//
// Lokale Koordinaten: Ursprung = Tempelmitte auf Bodenhöhe, das Tor
// zeigt nach -z ("vorn"), +z ist die Rückseite. Tiefentempel.ts dreht
// das Ganze um Vielfache von 90° in die Welt (CONFIG.tiefentempel.
// torRichtung) – Kollisionsboxen bleiben dadurch achsenparallel.
//
// Aufbau von außen nach innen:
//   Außenwand (Tor vorn in der Mitte)
//   Umgang: ein langer, ringsum laufender Gang
//   Labyrinthwand (Eingang hinten in der Mitte – gegenüber dem Tor)
//   Labyrinth aus zellen × zellen Feldern
//   Schatzkammer: die mittleren 3×3 Felder, eine Tür an der Vorderseite
//
// Wer hineinwill, muss also erst den halben Umgang entlang bis zur
// Rückseite und dann durchs Labyrinth wieder nach vorn zur Kammer.

const T = CONFIG.tiefentempel;

export const N = T.zellen;
export const ZELLE = T.zelle;
export const WAND = T.wand;
export const HOEHE = T.innenHoehe;
export const DECKE = 1.2; // Stärke der Decke über Umgang und Labyrinth
export const MITTE = (N - 1) >> 1; // mittlere Zelle (N ist ungerade)
export const LAB_HALB = (N * ZELLE) / 2; // Mittellinie der Labyrinth-Außenwand
export const INNEN = LAB_HALB + WAND / 2 + T.umgang; // Innenkante der Außenwand
export const AUSSEN = INNEN + 1.5; // Außenkante der Außenwand
export const RING = LAB_HALB + WAND / 2 + T.umgang / 2; // Mittellinie des Umgangs
export const TOR_BREITE = 6;
export const TOR_HOEHE = 4.5;
export const TORHAUS_BREITE = 16;
export const TORHAUS_TIEFE = 8;

export type FallenArt = 'stacheln' | 'axt' | 'harpune' | 'fallbeil';

export interface FallenPlan {
  art: FallenArt;
  i: number;
  j: number;
  // Laufrichtung des Gangs in dieser Zelle (für Axt, Harpune, Fallbeil)
  achse: 'x' | 'z';
  seite: 1 | -1; // Harpune: aus welcher Seitenwand geschossen wird
  phase: number; // 0..1, versetzt die Takte der Fallen gegeneinander
}

export interface Punkt {
  x: number;
  z: number;
}

// Mitte der Zelle i (bzw. j) und Lage der Rasterlinie l
export const zellMitte = (i: number): number => -LAB_HALB + ZELLE * (i + 0.5);
export const linie = (l: number): number => -LAB_HALB + ZELLE * l;
export const imRaum = (i: number, j: number): boolean =>
  Math.abs(i - MITTE) <= 1 && Math.abs(j - MITTE) <= 1;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mischen<X>(arr: X[], rnd: () => number): X[] {
  for (let k = arr.length - 1; k > 0; k--) {
    const m = Math.floor(rnd() * (k + 1));
    [arr[k], arr[m]] = [arr[m], arr[k]];
  }
  return arr;
}

const feld = <X>(w: number, h: number, v: X): X[][] =>
  Array.from({ length: w }, () => Array.from({ length: h }, () => v));

class Grundriss {
  // offenO[i][j]: Durchgang zwischen (i,j) und (i+1,j)
  // offenS[i][j]: Durchgang zwischen (i,j) und (i,j+1)
  private readonly offenO = feld(N - 1, N, false);
  private readonly offenS = feld(N, N - 1, false);
  readonly eingang = MITTE; // Spalte des Labyrintheingangs an der Rückwand
  readonly luft: Punkt[] = []; // Luftblasen (lokal)
  readonly fallen: FallenPlan[] = [];
  readonly stalkerPlaetze: Punkt[] = [];
  // Wegabstand jeder Zelle vom Labyrintheingang (in Feldern)
  readonly abstand: number[][];

  constructor() {
    const rnd = mulberry32(T.seed);
    this.graben(rnd);
    this.abstand = this.bfs([[this.eingang, N - 1]]).dist;
    this.planeLuft();
    this.planeFallen(rnd);
    this.planeStalker();
  }

  // ---- Wände ----

  // Senkrechte Wand (entlang z) auf Rasterlinie li (0..N) in Zeile j
  wandV(li: number, j: number): boolean {
    if (j < 0 || j >= N || li < 0 || li > N) return false;
    if (li === 0 || li === N) return true;
    return !this.offenO[li - 1][j];
  }

  // Waagerechte Wand (entlang x) auf Rasterlinie lj (0..N) in Spalte i
  wandH(i: number, lj: number): boolean {
    if (i < 0 || i >= N || lj < 0 || lj > N) return false;
    if (lj === 0) return true;
    if (lj === N) return i !== this.eingang;
    return !this.offenS[i][lj - 1];
  }

  // An einem Rasterpunkt steht ein Pfosten, sobald irgendeine Wand ihn
  // berührt – so schließen die Ecken ohne überlappende Wandstücke.
  pfosten(li: number, lj: number): boolean {
    return this.wandV(li, lj - 1) || this.wandV(li, lj) || this.wandH(li - 1, lj) || this.wandH(li, lj);
  }

  // Offene Nachbarn einer Zelle
  nachbarn(i: number, j: number): [number, number][] {
    const out: [number, number][] = [];
    if (i > 0 && !this.wandV(i, j)) out.push([i - 1, j]);
    if (i < N - 1 && !this.wandV(i + 1, j)) out.push([i + 1, j]);
    if (j > 0 && !this.wandH(i, j)) out.push([i, j - 1]);
    if (j < N - 1 && !this.wandH(i, j + 1)) out.push([i, j + 1]);
    return out;
  }

  private oeffne(i1: number, j1: number, i2: number, j2: number): void {
    if (j1 === j2) this.offenO[Math.min(i1, i2)][j1] = true;
    else this.offenS[i1][Math.min(j1, j2)] = true;
  }

  // Labyrinth graben: Tiefensuche (Recursive Backtracker) vom Eingang
  // aus, um die Schatzkammer herum. Das ergibt lange, verwinkelte Gänge
  // mit vielen Sackgassen. Danach bekommt die Kammer genau eine Tür –
  // an der Vorderseite, also so weit wie möglich vom Eingang weg – und
  // ein paar zusätzliche Durchbrüche sorgen für Rundwege.
  private graben(rnd: () => number): void {
    const besucht = feld(N, N, false);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) besucht[i][j] = imRaum(i, j);

    const stapel: [number, number][] = [[this.eingang, N - 1]];
    besucht[this.eingang][N - 1] = true;
    while (stapel.length > 0) {
      const [i, j] = stapel[stapel.length - 1];
      const frei = ([[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]] as [number, number][])
        .filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N && !besucht[a][b]);
      if (frei.length === 0) {
        stapel.pop();
        continue;
      }
      const [a, b] = frei[Math.floor(rnd() * frei.length)];
      this.oeffne(i, j, a, b);
      besucht[a][b] = true;
      stapel.push([a, b]);
    }

    // Kammer innen offen, Tür vorn in der Mitte
    for (let i = MITTE - 1; i <= MITTE + 1; i++) {
      for (let j = MITTE - 1; j <= MITTE + 1; j++) {
        if (i < MITTE + 1) this.oeffne(i, j, i + 1, j);
        if (j < MITTE + 1) this.oeffne(i, j, i, j + 1);
      }
    }
    this.oeffne(MITTE, MITTE - 1, MITTE, MITTE - 2);

    // Rundwege: zufällige Innenwände durchbrechen – aber keine, die
    // einen Rasterpunkt ganz ohne Wand zurückließe (sonst entstünden
    // hallenartige Flecken ohne Pfosten), und nicht an der Kammer.
    const kandidaten: [number, number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i < N - 1 && !this.offenO[i][j]) kandidaten.push([i, j, i + 1, j]);
        if (j < N - 1 && !this.offenS[i][j]) kandidaten.push([i, j, i, j + 1]);
      }
    }
    let rest: number = T.schleifen;
    for (const [i1, j1, i2, j2] of mischen(kandidaten, rnd)) {
      if (rest <= 0) break;
      if (imRaum(i1, j1) || imRaum(i2, j2)) continue;
      this.oeffne(i1, j1, i2, j2);
      // Endpunkte der geöffneten Wand prüfen
      const ends: [number, number][] = j1 === j2
        ? [[i1 + 1, j1], [i1 + 1, j1 + 1]]
        : [[i1, j1 + 1], [i1 + 1, j1 + 1]];
      if (ends.every(([li, lj]) => this.pfosten(li, lj))) {
        rest--;
      } else if (j1 === j2) {
        this.offenO[i1][j1] = false;
      } else {
        this.offenS[i1][j1] = false;
      }
    }
  }

  // Breitensuche über offene Durchgänge, von mehreren Startzellen aus
  private bfs(starts: [number, number][]): { dist: number[][]; vor: ([number, number] | null)[][] } {
    const dist = feld(N, N, Infinity);
    const vor = feld<[number, number] | null>(N, N, null);
    const queue: [number, number][] = [];
    for (const [i, j] of starts) {
      dist[i][j] = 0;
      queue.push([i, j]);
    }
    for (let q = 0; q < queue.length; q++) {
      const [i, j] = queue[q];
      for (const [a, b] of this.nachbarn(i, j)) {
        if (dist[a][b] !== Infinity) continue;
        dist[a][b] = dist[i][j] + 1;
        vor[a][b] = [i, j];
        queue.push([a, b]);
      }
    }
    return { dist, vor };
  }

  // Luftblasen: im Umgang an Ecken und Seitenmitten, im Labyrinth so
  // verteilt, dass keine Zelle mehr als `luftAbstand` Felder Weg von der
  // nächsten entfernt ist. Gierig: die entfernteste Zelle suchen und
  // `luftAbstand` Schritte Richtung nächster Blase zurück eine setzen –
  // so deckt jede neue Blase einen ganzen Ast ab.
  private planeLuft(): void {
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 0, 1]) {
        if (sx === 0 && sz === 0) continue;
        this.luft.push({ x: sx * RING, z: sz * RING });
      }
    }
    // Am Eingang deckt die Blase im Umgang hinten, in der Kammer eine
    // eigene gleich hinter der Tür
    const saat: [number, number][] = [[this.eingang, N - 1], [MITTE, MITTE - 1]];
    this.luft.push({ x: zellMitte(MITTE), z: zellMitte(MITTE - 1) });
    for (let runde = 0; runde < 80; runde++) {
      const { dist, vor } = this.bfs(saat);
      let fern: [number, number] = [0, 0];
      let max = -1;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (dist[i][j] !== Infinity && dist[i][j] > max) {
            max = dist[i][j];
            fern = [i, j];
          }
        }
      }
      if (max <= T.luftAbstand) break;
      let zelle = fern;
      for (let k = 0; k < T.luftAbstand; k++) zelle = vor[zelle[0]][zelle[1]] ?? zelle;
      saat.push(zelle);
      this.luft.push({ x: zellMitte(zelle[0]), z: zellMitte(zelle[1]) });
    }
  }

  // Fallen: über das ganze Labyrinth gestreut, nie in der Kammer, nicht
  // direkt am Eingang, nicht unter einer Luftblase und nie zwei Fallen
  // in benachbarten Feldern – zwischen zwei Fallen gibt es immer einen
  // Platz, an dem man den Takt abwarten kann. Gerade Gangstücke bekommen
  // Axt, Harpune oder Fallbeil, Ecken und Abzweige die Stachelfalle
  // (die wirkt nach allen Seiten). Sackgassen bleiben frei.
  private planeFallen(rnd: () => number): void {
    const belegt = feld(N, N, false);
    for (const l of this.luft) {
      const i = Math.floor((l.x + LAB_HALB) / ZELLE);
      const j = Math.floor((l.z + LAB_HALB) / ZELLE);
      if (i >= 0 && i < N && j >= 0 && j < N) belegt[i][j] = true;
    }
    const zellen: [number, number][] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) zellen.push([i, j]);
    mischen(zellen, rnd);
    // Gerade Gangstücke zuerst vergeben – davon gibt es weniger als
    // Ecken, und nur dort passen Axt, Harpune und Fallbeil hin
    const gerade = (i: number, j: number): boolean =>
      (!this.wandV(i, j) && !this.wandV(i + 1, j) && this.wandH(i, j) && this.wandH(i, j + 1)) ||
      (!this.wandH(i, j) && !this.wandH(i, j + 1) && this.wandV(i, j) && this.wandV(i + 1, j));
    zellen.sort((a, b) => +gerade(b[0], b[1]) - +gerade(a[0], a[1]));

    for (const [i, j] of zellen) {
      if (this.fallen.length >= T.fallen.anzahl) break;
      const art = rnd();
      const seite: 1 | -1 = rnd() < 0.5 ? 1 : -1;
      const phase = rnd();
      if (imRaum(i, j) || belegt[i][j] || this.abstand[i][j] < 3) continue;
      if (
        (i > 0 && this.hatFalle(i - 1, j)) ||
        (i < N - 1 && this.hatFalle(i + 1, j)) ||
        (j > 0 && this.hatFalle(i, j - 1)) ||
        (j < N - 1 && this.hatFalle(i, j + 1))
      ) continue;

      const w = !this.wandV(i, j);
      const o = !this.wandV(i + 1, j);
      const v = !this.wandH(i, j);
      const h = !this.wandH(i, j + 1);
      const offen = +w + +o + +v + +h;
      if (offen <= 1) continue; // Sackgasse
      const gang = offen === 2 && ((w && o) || (v && h));
      let typ: FallenArt = 'stacheln';
      if (gang) {
        typ = art < 0.32 ? 'axt' : art < 0.6 ? 'fallbeil' : art < 0.86 ? 'harpune' : 'stacheln';
      }
      this.fallen.push({ art: typ, i, j, achse: w && o ? 'x' : 'z', seite, phase });
      belegt[i][j] = true;
    }
  }

  private hatFalle(i: number, j: number): boolean {
    return this.fallen.some((f) => f.i === i && f.j === j);
  }

  // Wo der Stalker stehen kann: jede Zelle des Labyrinths und alle
  // 4 m entlang des Umgangs
  private planeStalker(): void {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) this.stalkerPlaetze.push({ x: zellMitte(i), z: zellMitte(j) });
    }
    const schritte = Math.floor(RING / ZELLE);
    for (let k = -schritte; k <= schritte; k++) {
      const s = k * ZELLE;
      this.stalkerPlaetze.push(
        { x: s, z: -RING }, { x: s, z: RING }, { x: -RING, z: s }, { x: RING, z: s },
      );
    }
  }

  // ---- Abfragen in lokalen Koordinaten ----

  // Liegt der Punkt im begehbaren Innenraum (Umgang oder Labyrinth)?
  innen(x: number, y: number, z: number): boolean {
    return Math.abs(x) < INNEN && Math.abs(z) < INNEN && y > -0.5 && y < HOEHE + 0.5;
  }

  // Ist an dieser Stelle Mauerwerk? Deckt Boden, Decke, Außenwand (mit
  // Tor) und das Labyrinth ab – genug für Sichtlinien im Inneren.
  fest(x: number, y: number, z: number): boolean {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    if (ax > AUSSEN || az > AUSSEN) return false; // draußen
    if (y < 0 || y > HOEHE) return true;
    if (ax >= INNEN || az >= INNEN) {
      // Außenwand, nur das Tor ist offen
      return !(z < 0 && ax < TOR_BREITE / 2 && y < TOR_HOEHE);
    }
    const halb = LAB_HALB + WAND / 2;
    if (ax > halb || az > halb) return false; // Umgang
    const li = Math.round((x + LAB_HALB) / ZELLE);
    const lj = Math.round((z + LAB_HALB) / ZELLE);
    const nahV = Math.abs(x - linie(li)) < WAND / 2;
    const nahH = Math.abs(z - linie(lj)) < WAND / 2;
    if (nahV && nahH) return this.pfosten(li, lj);
    if (nahV) return this.wandV(li, Math.min(N - 1, Math.max(0, Math.floor((z + LAB_HALB) / ZELLE))));
    if (nahH) return this.wandH(Math.min(N - 1, Math.max(0, Math.floor((x + LAB_HALB) / ZELLE))), lj);
    return false;
  }
}

export const PLAN = new Grundriss();

// ---- Lokal <-> Welt ----
// Viertel-Drehungen exakt (ohne Rundungsrauschen von sin/cos)
const DREH = ((T.torRichtung % 4) + 4) % 4;
const COS = [1, 0, -1, 0][DREH];
const SIN = [0, 1, 0, -1][DREH];
export const TEMPEL_DREHUNG = (DREH * Math.PI) / 2; // für Object3D.rotation.y

export function zuWelt(lx: number, lz: number): Punkt {
  return { x: T.x + lx * COS + lz * SIN, z: T.z - lx * SIN + lz * COS };
}

export function zuLokal(wx: number, wz: number): Punkt {
  const dx = wx - T.x;
  const dz = wz - T.z;
  return { x: dx * COS - dz * SIN, z: dx * SIN + dz * COS };
}

// Richtung (lokal) als Blickwinkel (yaw) für MouseLook in der Welt
export function blickYaw(lx: number, lz: number): number {
  const wx = lx * COS + lz * SIN;
  const wz = -lx * SIN + lz * COS;
  return Math.atan2(-wx, -wz);
}
