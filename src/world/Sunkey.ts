import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { insideLake } from './lake';
import { Ocean } from './Ocean';
import type { StalkerView } from './Stalker';

// Sunkey (sunkey.glb): eine flache, lila Gestalt, die knapp über dem
// Wasser steht – immer genau so weit weg, dass sie gerade noch aus dem
// Nebel schaut, und immer mit dem Gesicht zum Spieler. Nähern hilft
// nicht: Sie hält den Abstand, egal wohin man schwimmt oder fährt.
//
// Wer sie zu lange direkt ansieht, wird angesprungen – wie beim Stalker,
// aber ohne Schrei: völlige Stille. Danach übernimmt der WhyState
// (schwarzer Bildschirm, „WHY?“, ganz leise „Daisy Bell“).
//
// Sie erscheint nur, wenn der Spieler über Wasser schaut (an Deck oder
// an der Oberfläche) und gerade kein Stalker unterwegs ist.

const S = CONFIG.sunkey;

type Phase = 'versteckt' | 'da' | 'jumpscare' | 'weg';

// Gesichtshöhe über der Bildmitte, als Anteil der Körpergröße
const GESICHT = 0.3;

// Abstand, in dem der Nebel über Wasser noch `sichtAnteil` der Farbe
// durchlässt (FogExp2: Sicht = exp(-(Dichte·d)²))
const ABSTAND = Math.sqrt(-Math.log(S.sichtAnteil)) / CONFIG.world.fogAbove.density;

export class Sunkey {
  readonly group = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private phase: Phase = 'versteckt';
  private timer: number = S.ersteWartezeit;
  private blickTimer = 0;
  private fade = 0;
  // Weltrichtung vom Spieler zu ihr – bleibt während des Auftritts fest,
  // die Position wandert mit dem Spieler mit
  private readonly richtung = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  // Andere Wesen (Stalker) dürfen sie vorübergehend fernhalten
  gesperrt = false;

  constructor(
    scene: THREE.Scene,
    private readonly ocean: Ocean,
    private readonly onJumpscare: () => void,
  ) {
    this.group.visible = false;
    scene.add(this.group);
    loadModel('sunkey.glb', S.size)
      .then(({ template }) => {
        const model = template.clone(true);
        // eigene Materialien zum Ein- und Ausblenden
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const kopien = mats.map((m) => {
            const c = m.clone();
            c.transparent = true;
            c.depthWrite = false;
            c.side = THREE.DoubleSide;
            return c;
          });
          mesh.material = Array.isArray(mesh.material) ? kopien : kopien[0];
          this.materials.push(...kopien);
        });
        this.group.add(model);
        this.setOpacity(this.fade);
      })
      .catch(() => {
        // Ohne Modell: eine flache dunkle Silhouette
        const mat = new THREE.MeshBasicMaterial({ color: 0x3a0a4a, transparent: true, side: THREE.DoubleSide });
        this.group.add(new THREE.Mesh(new THREE.PlaneGeometry(S.size * 0.5, S.size), mat));
        this.materials.push(mat);
        this.setOpacity(this.fade);
      });
  }

  get sichtbar(): boolean {
    return this.phase !== 'versteckt';
  }

  // Fortschritt des Blick-Countdowns (0..1) – treibt die Bildstörung
  get blickAnteil(): number {
    if (this.phase === 'jumpscare') return 1;
    if (this.phase !== 'da') return 0;
    return Math.min(1, this.blickTimer / S.blick.sekunden);
  }

  get abstand(): number {
    return ABSTAND;
  }

  private setOpacity(o: number): void {
    for (const m of this.materials) m.opacity = o;
    this.group.visible = o > 0.01;
  }

  update(dt: number, view: StalkerView): void {
    switch (this.phase) {
      case 'versteckt':
        if (this.gesperrt || view.underwater) return; // wartet ab
        this.timer -= dt;
        if (this.timer <= 0 && !this.erscheinen(view, false)) this.timer = 5;
        return;

      case 'da':
        this.updateDa(dt, view);
        return;

      case 'jumpscare':
        // klebt vor der Kamera, das Gesicht füllt das Bild
        this.vorsGesicht(view);
        this.timer -= dt;
        if (this.timer <= 0) this.verschwinden(true);
        return;

      case 'weg':
        this.timer -= dt;
        this.fade = Math.max(0, this.timer / S.verschwindenDauer);
        this.setOpacity(this.fade);
        if (this.fade <= 0) {
          this.phase = 'versteckt';
          this.blickTimer = 0;
          this.timer = S.pauseMin + Math.random() * (S.pauseMax - S.pauseMin);
        }
        return;
    }
  }

  private updateDa(dt: number, view: StalkerView): void {
    // Wer abtaucht, verliert sie aus den Augen
    if (view.underwater) {
      this.verschwinden(false);
      return;
    }
    this.platziere(view);

    // zu lange angesehen: Sprung – in völliger Stille
    if (this.wirdAngesehen(view)) {
      this.blickTimer += dt;
      if (this.blickTimer >= S.blick.sekunden) {
        this.phase = 'jumpscare';
        this.timer = S.jumpscare.dauer;
        this.fade = 1;
        this.setOpacity(1);
        this.vorsGesicht(view);
        this.onJumpscare();
      }
      return; // wer hinsieht, hält sie fest
    }
    this.blickTimer = Math.max(0, this.blickTimer - dt * S.blick.abklingen);
    this.timer -= dt;
    if (this.timer <= 0) this.verschwinden(false);
  }

  // Immer im festen Abstand in ihrer Richtung, knapp über der Welle,
  // das Gesicht zum Spieler
  private platziere(view: StalkerView): void {
    const x = view.eye.x + this.richtung.x * ABSTAND;
    const z = view.eye.z + this.richtung.z * ABSTAND;
    const welle = this.ocean.height(x, z);
    this.group.position.set(x, welle + S.schwebeHoehe + S.size / 2, z);
    this.schautZu(view.eye);
  }

  private schautZu(ziel: THREE.Vector3): void {
    // flache Figur: die Vorderseite (+z) dreht sich zum Spieler
    this.group.rotation.y = Math.atan2(ziel.x - this.group.position.x, ziel.z - this.group.position.z);
  }

  private wirdAngesehen(view: StalkerView): boolean {
    const to = this.tmp.copy(this.group.position);
    to.y += S.size * GESICHT;
    to.sub(view.eye);
    const dist = to.length();
    if (dist < 0.001) return true;
    const cos = to.divideScalar(dist).dot(view.dir);
    if (cos <= 0) return false;
    const winkel = Math.acos(Math.min(1, cos));
    return winkel <= Math.atan2(S.size * 0.3, dist) + S.blick.toleranz;
  }

  private vorsGesicht(view: StalkerView): void {
    this.group.position.copy(view.eye).addScaledVector(view.dir, S.jumpscare.abstand);
    this.group.position.y = view.eye.y - S.size * GESICHT;
    this.schautZu(view.eye);
  }

  private verschwinden(sofort: boolean): void {
    if (this.phase === 'weg' || this.phase === 'versteckt') return;
    this.phase = 'weg';
    this.timer = sofort ? 0.001 : S.verschwindenDauer;
  }

  // Richtung wählen: im Blickfeld, mit etwas Streuung zur Seite, und so,
  // dass sie über dem See steht (nicht in der Steilküste)
  private erscheinen(view: StalkerView, erzwingen: boolean): boolean {
    if (view.underwater && !erzwingen) return false;
    const blickYaw = Math.atan2(view.dir.x, view.dir.z);
    for (let versuch = 0; versuch < 12; versuch++) {
      const streu = erzwingen && versuch === 0 ? 0 : (Math.random() - 0.5) * S.streuung * 2;
      const yaw = blickYaw + streu;
      this.richtung.set(Math.sin(yaw), 0, Math.cos(yaw));
      const x = view.eye.x + this.richtung.x * ABSTAND;
      const z = view.eye.z + this.richtung.z * ABSTAND;
      if (!insideLake(x, z, 3)) continue;
      this.phase = 'da';
      this.blickTimer = 0;
      this.timer = S.dauer;
      this.fade = 1;
      this.setOpacity(1);
      this.platziere(view);
      return true;
    }
    return false;
  }

  // Cheat: sofort erscheinen, mitten im Blickfeld
  erscheineJetzt(view: StalkerView): boolean {
    this.phase = 'versteckt';
    return this.erscheinen(view, true);
  }
}
