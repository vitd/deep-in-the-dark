import { CONFIG } from '../config';
import { UI } from './UIManager';

// Das Nachspiel nach Sunkeys „WHY?“, über dem schon wieder laufenden
// Spiel: Ein weißer Blitz löscht den schwarzen Bildschirm aus und klingt
// ab, dann ziehen große Sunkeys direkt hintereinander von rechts nach
// links über den Bildschirm, dazu ihr irres Lachen. Läuft mit eigener
// Animationsschleife – unabhängig vom Spielzustand – und räumt sich
// am Ende selbst auf.

const E = CONFIG.sunkey.ende;

interface Lachen {
  spielen: () => void;
  stoppen: () => void;
  schliessen: () => void;
}

let laufend: { abbrechen: () => void } | null = null;

export function sunkeyNachspiel(bildUrl: string | null, lachen: Lachen): void {
  laufend?.abbrechen();
  const start = performance.now();
  const figuren: HTMLImageElement[] = [];
  const hoehe = () => window.innerHeight * E.paradeHoehe;

  if (bildUrl) {
    for (let k = 0; k < E.paradeAnzahl; k++) {
      const el = document.createElement('img');
      el.src = bildUrl;
      el.alt = '';
      el.style.height = `${Math.round(hoehe())}px`;
      UI.sunkeyParade.append(el);
      figuren.push(el);
    }
  }
  lachen.spielen();

  let rahmen = 0;
  let fertig = false;
  const aufraeumen = () => {
    if (fertig) return;
    fertig = true;
    cancelAnimationFrame(rahmen);
    for (const f of figuren) f.remove();
    UI.blitz.style.opacity = '0';
    lachen.stoppen();
    lachen.schliessen();
    laufend = null;
  };

  const schritt = () => {
    const t = (performance.now() - start) / 1000;

    // Blitz: voll weiß, dann wieder klare Sicht
    const deck = t < E.blitzHalten ? 1 : Math.max(0, 1 - (t - E.blitzHalten) / E.blitzAbklingen);
    UI.blitz.style.opacity = deck.toFixed(3);

    // Parade: ein Zug aus Figuren, Schulter an Schulter, von ganz rechts
    // (komplett außerhalb) bis ganz links (komplett außerhalb)
    const breite = window.innerWidth;
    const h = hoehe();
    const figurBreite = figuren[0]?.offsetWidth || h * 0.53;
    const zug = figurBreite * figuren.length;
    const u = Math.min(1, t / E.paradeDauer);
    const kopf = breite - u * (breite + zug); // linke Kante der vordersten Figur
    const y = (window.innerHeight - h) / 2;
    figuren.forEach((el, k) => {
      const phase = t * 4.2 + k * 0.9; // jede Figur im eigenen Schritt
      const hopp = -Math.abs(Math.sin(phase)) * h * 0.035;
      const kipp = Math.sin(phase) * 3.5;
      el.style.transform = `translate(${(kopf + k * figurBreite).toFixed(1)}px, ${(y + hopp).toFixed(1)}px) rotate(${kipp.toFixed(2)}deg)`;
    });

    if (t >= E.paradeDauer && deck <= 0) {
      aufraeumen();
      return;
    }
    rahmen = requestAnimationFrame(schritt);
  };
  UI.blitz.style.opacity = '1';
  rahmen = requestAnimationFrame(schritt);
  laufend = { abbrechen: aufraeumen };
}

// Für den Rückweg ins Hauptmenü: ein laufendes Nachspiel sofort beenden
export function sunkeyNachspielAbbrechen(): void {
  laufend?.abbrechen();
}
