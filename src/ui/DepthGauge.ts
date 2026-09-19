import { CONFIG } from '../config';

// Tiefenanzeige am linken Bildrand: eine senkrechte Skala über die ganze
// Bildschirmhöhe, oben die Wasseroberfläche (0 m), unten `maxTiefe`.
// Eine Marke mit Zahl zeigt die aktuelle Tiefe des Kopfes, der Seeboden
// unter dem Spieler ist als dunkler Sockel eingetragen – so sieht man
// auf einen Blick, wie tief es hier überhaupt geht.
//
// Reines DOM (wie die Überlebensbalken): Teilstriche und Beschriftung
// entstehen einmal beim Aufbau, pro Bild wandern nur Marke und Sockel.

const T = CONFIG.tiefenanzeige;

export class DepthGauge {
  private readonly marker: HTMLElement;
  private readonly markerText: HTMLElement;
  private readonly floor: HTMLElement;
  private readonly surface: HTMLElement;
  private lastDepth = -1;
  private lastFloor = -1;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = '';

    const track = document.createElement('div');
    track.className = 'depth-track';
    root.append(track);

    // Seeboden-Sockel: von der Bodentiefe bis ganz unten
    this.floor = document.createElement('div');
    this.floor.className = 'depth-floor';
    track.append(this.floor);

    // Teilstriche mit Beschriftung
    for (let m = 0; m <= T.maxTiefe; m += T.schritt) {
      const tick = document.createElement('div');
      const beschriftet = m % T.beschriftung === 0;
      tick.className = beschriftet ? 'depth-tick major' : 'depth-tick';
      tick.style.top = `${(m / T.maxTiefe) * 100}%`;
      if (beschriftet) {
        const label = document.createElement('span');
        label.className = 'depth-label';
        label.textContent = String(m); // die Einheit steht an der Marke
        tick.append(label);
      }
      track.append(tick);
    }

    // Wasseroberfläche als heller Strich ganz oben
    this.surface = document.createElement('div');
    this.surface.className = 'depth-surface';
    track.append(this.surface);

    // Marke: Pfeil auf der Skala plus Zahl daneben
    this.marker = document.createElement('div');
    this.marker.className = 'depth-marker';
    this.markerText = document.createElement('span');
    this.markerText.className = 'depth-value';
    this.marker.append(this.markerText);
    track.append(this.marker);

    this.update(0, 0);
  }

  // `depth`: aktuelle Kopftiefe in Metern (0 = an/über der Oberfläche),
  // `floorDepth`: Tiefe des Seebodens unter dem Spieler.
  update(depth: number, floorDepth: number): void {
    const d = Math.max(0, Math.min(T.maxTiefe, depth));
    const f = Math.max(0, Math.min(T.maxTiefe, floorDepth));

    // Nur bei Änderung ins DOM schreiben – das ist pro Bild sonst der
    // teuerste Teil
    const dr = Math.round(d * 10) / 10;
    if (dr !== this.lastDepth) {
      this.lastDepth = dr;
      this.marker.style.top = `${(d / T.maxTiefe) * 100}%`;
      this.markerText.textContent = `${Math.round(d)} m`;
      this.root.classList.toggle('surface', d < 0.5);
    }
    const fr = Math.round(f);
    if (fr !== this.lastFloor) {
      this.lastFloor = fr;
      this.floor.style.top = `${(f / T.maxTiefe) * 100}%`;
    }
  }
}
