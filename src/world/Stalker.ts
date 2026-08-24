import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { BoatFrame } from './BoatFrame';
import { DECK_Y, ROOF_Y } from './boatLayout';
import { clampSwimY, insideLake } from './lake';

// Der Stalker: eine hagere, überlebensgroße Gestalt, die man immer nur
// kurz zu sehen bekommt. Er verfolgt niemanden – er steht einfach da,
// sieht einen an und ist wieder weg. Es gibt genau einen; die meiste
// Zeit ist er gar nicht in der Welt (Phase 'versteckt').
//
// Drei Auftritte, je nach Lage des Spielers:
//   'schiff'  – an Deck. Wer sich nähert, sieht ihn zwinkern und
//               verschwinden.
//   'himmel'  – reglos in der Luft über dem Wasser. Er bewegt sich
//               nicht von der Stelle, dreht sich aber immer zum Spieler.
//   'wasser'  – unter Wasser, aufrecht im Freiwasser. Taucht der
//               Spieler auf, ist er weg.
//
// Gefährlich wird er nur durch Hinsehen: Wer ihn `blick.sekunden` lang
// ununterbrochen direkt ansieht (er steht im Fadenkreuz), wird
// angesprungen – danach bleiben nur noch 10 % Leben. Der Countdown
// gilt für alle drei Auftritte; wegsehen baut ihn wieder ab. Solange
// man ihn ansieht, wartet er: seine Auftrittsdauer läuft dann nicht.
//
// Er erscheint grundsätzlich im Blickfeld: ein Stalker, den niemand
// sieht, ist keiner.

const ST = CONFIG.stalker;

export type StalkerMode = 'schiff' | 'himmel' | 'wasser';

type Phase = 'versteckt' | 'da' | 'jumpscare' | 'weg';

// Was der Stalker vom Spieler wissen muss. PlayState füllt das Objekt
// einmal pro Bild, es wird nicht kopiert.
export interface StalkerView {
  eye: THREE.Vector3; // Augenposition (Weltkoordinaten)
  dir: THREE.Vector3; // Blickrichtung (normiert)
  inWater: boolean; // schwimmt oder taucht
  underwater: boolean; // Kopf unter Wasser
}

// Standplätze an Deck, in Bootskoordinaten (Ursprung = Bootsmitte auf
// Wasserlinie, +z = Heck). Gangway, Vor- und Achterdeck sowie das freie
// Stück Dach hinter dem Kartenraum – überall dort, wo auch der Spieler
// stehen kann.
const DECK_SPOTS: readonly (readonly [number, number, number])[] = [
  [0, DECK_Y, -11.2], // Bug
  [-1.8, DECK_Y, -10.6],
  [1.8, DECK_Y, -10.6],
  [-3.1, DECK_Y, -6.5], // Gang backbord
  [-3.1, DECK_Y, 0],
  [-3.1, DECK_Y, 6.5],
  [3.1, DECK_Y, -6.5], // Gang steuerbord
  [3.1, DECK_Y, 0],
  [3.1, DECK_Y, 6.5],
  [0, DECK_Y, 11.0], // Achterdeck
  [-2.0, DECK_Y, 10.4],
  [2.0, DECK_Y, 10.4],
  [0, ROOF_Y, -1.5], // Dachplatte hinter dem Kartenraum
  [-1.6, ROOF_Y, 3.5],
  [1.6, ROOF_Y, 7.5],
];

// Höhe des Kopfes über der Körpermitte, als Anteil der Körpergröße.
// Beim Jumpscare sitzt so das Gesicht auf Augenhöhe (nicht der Bauch),
// und der Blick-Countdown misst gegen den Kopf, nicht gegen die Füße.
const KOPF_ANTEIL = 0.4;

export class Stalker {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private currentClip = '';
  // eigene Materialkopien – über sie wird ein- und ausgeblendet
  private readonly materials: THREE.Material[] = [];
  private phase: Phase = 'versteckt';
  private mode: StalkerMode = 'schiff';
  private timer: number = ST.ersteWartezeit; // Restdauer der laufenden Phase
  private blickTimer = 0; // wie lange der Spieler ihn schon ansieht
  private fade = 0; // 0 = unsichtbar, 1 = voll da
  // Standplatz an Deck in Boots-Originalkoordinaten: das Boot fährt,
  // der Stalker fährt mit
  private readonly anker = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly onJumpscare: () => void) {
    this.group.visible = false;
    scene.add(this.group);
    loadModel('stalker.glb', ST.size)
      .then(({ template, clips }) => {
        // Das Modell schaut nach -z; gedreht zeigt +z nach vorn, damit
        // rotation.y = atan2(dx, dz) ihn zum Spieler dreht.
        template.rotation.y = Math.PI;
        const model = template.clone(true);
        // Klone teilen sich die Materialien des Templates – zum
        // Ausblenden braucht der Stalker eigene.
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const copies = mats.map((m) => {
            const c = m.clone();
            c.transparent = true;
            c.depthWrite = false;
            return c;
          });
          mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
          this.materials.push(...copies);
        });
        this.group.add(model);
        this.mixer = new THREE.AnimationMixer(model);
        this.clips = clips;
        this.setOpacity(this.fade);
      })
      .catch(() => {
        // Fallback: eine dunkle, dürre Silhouette
        const mat = new THREE.MeshLambertMaterial({ color: 0x14161a, transparent: true });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, ST.size * 0.7, 0.3), mat);
        body.position.y = -ST.size * 0.15;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, ST.size * 0.2, 0.45), mat);
        head.position.y = ST.size * 0.35;
        this.group.add(body, head);
        this.materials.push(mat);
        this.setOpacity(this.fade);
      });
  }

  get sichtbar(): boolean {
    return this.phase !== 'versteckt';
  }

  private setOpacity(o: number): void {
    for (const m of this.materials) m.opacity = o;
    this.group.visible = o > 0.01;
  }

  private play(name: string): void {
    if (!this.mixer || this.currentClip === name) return;
    const clip = THREE.AnimationClip.findByName(this.clips, name);
    if (!clip) return;
    this.mixer.stopAllAction();
    this.mixer.clipAction(clip).play();
    this.currentClip = name;
  }

  update(dt: number, view: StalkerView, boatCenter: THREE.Vector3, frame: BoatFrame): void {
    this.mixer?.update(dt);

    switch (this.phase) {
      case 'versteckt':
        this.timer -= dt;
        if (this.timer <= 0 && !this.spawn(view, boatCenter, frame)) {
          this.timer = 5; // Lage passt gerade nicht – gleich neu versuchen
        }
        return;

      case 'da':
        this.updateDa(dt, view, frame);
        return;

      case 'jumpscare':
        // Er klebt vor der Kamera, auch wenn der Spieler sich wegdreht
        this.placeInFace(view);
        this.timer -= dt;
        if (this.timer <= 0) this.vanish();
        return;

      case 'weg':
        this.timer -= dt;
        this.fade = Math.max(0, this.timer / ST.verschwindenDauer);
        this.setOpacity(this.fade);
        if (this.fade <= 0) {
          this.phase = 'versteckt';
          this.blickTimer = 0;
          this.currentClip = '';
          this.mixer?.stopAllAction();
          this.timer = ST.pauseMin + Math.random() * (ST.pauseMax - ST.pauseMin);
        }
        return;
    }
  }

  // Auftritt läuft: dastehen, zum Spieler drehen, auf Annäherung reagieren
  private updateDa(dt: number, view: StalkerView, frame: BoatFrame): void {
    // An Deck hängt er am fahrenden Boot
    if (this.mode === 'schiff') {
      this.group.position.copy(frame.toWorld(this.tmp.copy(this.anker)));
    }
    this.faceTo(view.eye);

    const dist = this.group.position.distanceTo(view.eye);
    if (dist > ST.maxAbstand) {
      this.vanish();
      return;
    }

    if (this.mode === 'wasser') {
      // Wer den Kopf aus dem Wasser nimmt, verliert ihn aus den Augen
      if (!view.underwater) {
        this.vanish();
        return;
      }
    } else {
      const flucht = this.mode === 'schiff' ? ST.schiff.fluchtRadius : ST.himmel.fluchtRadius;
      if (dist < flucht) {
        // An Deck zwinkert er noch kurz, dann ist der Platz leer
        if (this.mode === 'schiff') this.play('wink');
        this.vanish();
        return;
      }
    }

    // Der eigentliche Auslöser: ihn zu lange direkt ansehen
    if (this.wirdAngesehen(view)) {
      this.blickTimer += dt;
      if (this.blickTimer >= ST.blick.sekunden) {
        this.startJumpscare(view);
        return;
      }
      return; // wer hinsieht, hält ihn: die Auftrittsdauer läuft nicht
    }
    this.blickTimer = Math.max(0, this.blickTimer - dt * ST.blick.abklingen);

    this.timer -= dt;
    if (this.timer <= 0) this.vanish();
  }

  // Sieht der Spieler ihn direkt an? Maßstab ist seine scheinbare
  // Breite: aus der Nähe genügt grobes Hinschauen, aus der Ferne muss
  // er wirklich im Fadenkreuz stehen. Gemessen wird gegen den Kopf.
  private wirdAngesehen(view: StalkerView): boolean {
    const to = this.tmp.copy(this.group.position);
    to.y += ST.size * KOPF_ANTEIL;
    to.sub(view.eye);
    const dist = to.length();
    if (dist < 0.001) return true;
    const cos = to.divideScalar(dist).dot(view.dir);
    if (cos <= 0) return false; // steht hinter einem
    const winkel = Math.acos(Math.min(1, cos));
    const halbeBreite = Math.atan2(ST.size * 0.5, dist) + ST.blick.toleranz;
    return winkel <= halbeBreite;
  }

  private faceTo(target: THREE.Vector3): void {
    this.group.rotation.y = Math.atan2(
      target.x - this.group.position.x,
      target.z - this.group.position.z,
    );
  }

  private vanish(): void {
    if (this.phase === 'weg' || this.phase === 'versteckt') return;
    this.phase = 'weg';
    this.timer = ST.verschwindenDauer;
  }

  private startJumpscare(view: StalkerView): void {
    this.phase = 'jumpscare';
    this.timer = ST.jumpscare.dauer;
    this.fade = 1;
    this.setOpacity(1);
    this.play('jumpscare');
    this.placeInFace(view);
    this.onJumpscare();
  }

  // Direkt vor die Kamera, Gesicht auf Augenhöhe
  private placeInFace(view: StalkerView): void {
    this.group.position
      .copy(view.eye)
      .addScaledVector(view.dir, ST.jumpscare.abstand);
    this.group.position.y = view.eye.y - ST.size * KOPF_ANTEIL;
    this.faceTo(view.eye);
  }

  // ---------- Auftritt vorbereiten ----------

  // Sucht einen zur Lage passenden Auftritt. false = gerade keiner möglich.
  private spawn(
    view: StalkerView,
    boatCenter: THREE.Vector3,
    frame: BoatFrame,
    force?: StalkerMode,
  ): boolean {
    const mode = force ?? this.pickMode(view, boatCenter);
    if (!mode) return false;
    const ok =
      mode === 'schiff'
        ? this.spawnSchiff(view, frame, !!force)
        : mode === 'himmel'
          ? this.spawnHimmel(view)
          : this.spawnWasser(view, !!force);
    if (!ok) return false;
    this.mode = mode;
    this.phase = 'da';
    this.blickTimer = 0;
    this.fade = 1;
    this.setOpacity(1);
    this.timer =
      mode === 'schiff' ? ST.schiff.dauer : mode === 'himmel' ? ST.himmel.dauer : ST.wasser.dauer;
    this.play(mode === 'himmel' ? 'fly' : 'idle');
    this.faceTo(view.eye);
    return true;
  }

  private pickMode(view: StalkerView, boatCenter: THREE.Vector3): StalkerMode | null {
    if (view.underwater) {
      return view.eye.y < ST.wasser.minSpielerTiefe ? 'wasser' : null;
    }
    const anBord =
      !view.inWater &&
      Math.hypot(view.eye.x - boatCenter.x, view.eye.z - boatCenter.z) < ST.bootNaehe;
    if (anBord) return Math.random() < 0.55 ? 'schiff' : 'himmel';
    return 'himmel';
  }

  // Deckplatz: im Blickfeld, aber nicht direkt vor der Nase. `force`
  // (Cheat) nimmt notfalls den entferntesten Platz, damit der Auftritt
  // auf jeden Fall zustande kommt.
  private spawnSchiff(view: StalkerView, frame: BoatFrame, force: boolean): boolean {
    const b = CONFIG.world.boatPos;
    const start = Math.floor(Math.random() * DECK_SPOTS.length);
    let ersatz: (typeof DECK_SPOTS)[number] | null = null;
    let ersatzDist: number = ST.schiff.fluchtRadius;
    for (let i = 0; i < DECK_SPOTS.length; i++) {
      const spot = DECK_SPOTS[(start + i) % DECK_SPOTS.length];
      this.setDeckAnker(spot, frame);
      const dist = this.tmp.distanceTo(view.eye);
      if (dist > ersatzDist) {
        ersatz = spot;
        ersatzDist = dist;
      }
      if (dist < ST.schiff.minAbstand) continue;
      if (!this.imBlickfeld(this.tmp, view)) continue;
      this.group.position.copy(this.tmp);
      return true;
    }
    if (!force || !ersatz) return false;
    this.setDeckAnker(ersatz, frame);
    this.group.position.copy(this.tmp);
    return true;
  }

  // Deckplatz in Boots-Originalkoordinaten nach `anker`, aktuelle
  // Weltposition nach `tmp`
  private setDeckAnker(spot: (typeof DECK_SPOTS)[number], frame: BoatFrame): void {
    const b = CONFIG.world.boatPos;
    this.anker.set(b.x + spot[0], b.y + spot[1] + ST.size / 2, b.z + spot[2]);
    frame.toWorld(this.tmp.copy(this.anker));
  }

  // Reglos in der Luft, irgendwo vor dem Spieler
  private spawnHimmel(view: StalkerView): boolean {
    const H = ST.himmel;
    this.streuPunkt(view, H.abstandMin, H.abstandMax);
    if (!insideLake(this.tmp.x, this.tmp.z, 5)) return false;
    this.tmp.y =
      CONFIG.world.seaLevel + H.hoeheMin + Math.random() * (H.hoeheMax - H.hoeheMin);
    if (this.tmp.distanceTo(view.eye) < H.fluchtRadius * 1.5) return false;
    this.group.position.copy(this.tmp);
    return true;
  }

  // Unter Wasser, auf Augenhöhe des Tauchers – er soll im Bild stehen,
  // nicht unter dem Bildrand.
  private spawnWasser(view: StalkerView, force: boolean): boolean {
    const W = ST.wasser;
    // Der Cheat setzt ihn dicht heran, damit man ihn sofort ins
    // Fadenkreuz nehmen kann
    if (force) this.streuPunkt(view, W.abstandMin * 0.6, W.abstandMin, true);
    else this.streuPunkt(view, W.abstandMin, W.abstandMax, true);
    if (!insideLake(this.tmp.x, this.tmp.z, 5)) return false;
    this.tmp.y = clampSwimY(this.tmp.x, this.tmp.z, this.tmp.y, W.minY, W.maxY);
    this.group.position.copy(this.tmp);
    return true;
  }

  // Punkt vor dem Spieler, Abstand in [minR, maxR], mit etwas Streuung
  // zur Seite – landet in `tmp`. `mitNeigung` nimmt die Blickneigung mit
  // (unter Wasser); sonst bleibt y die Augenhöhe und der Aufrufer setzt
  // die Höhe selbst.
  private streuPunkt(view: StalkerView, minR: number, maxR: number, mitNeigung = false): void {
    const yaw = Math.atan2(view.dir.x, view.dir.z) + (Math.random() - 0.5) * 0.8;
    const r = minR + Math.random() * (maxR - minR);
    // waagerechter Anteil der Blickrichtung, damit der Abstand stimmt
    const flach = Math.hypot(view.dir.x, view.dir.z) || 1;
    this.tmp.set(
      view.eye.x + Math.sin(yaw) * r * flach,
      mitNeigung ? view.eye.y + view.dir.y * r : view.eye.y,
      view.eye.z + Math.cos(yaw) * r * flach,
    );
  }

  private imBlickfeld(pos: THREE.Vector3, view: StalkerView): boolean {
    const dx = pos.x - view.eye.x;
    const dy = pos.y - view.eye.y;
    const dz = pos.z - view.eye.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return (dx * view.dir.x + dy * view.dir.y + dz * view.dir.z) / len > ST.sichtKegel;
  }

  // Debug: Auftritt sofort erzwingen (Cheat-Menü). Liefert false, wenn
  // der Platz gerade nicht taugt (z. B. Deck ohne Boot in Sicht).
  erscheineJetzt(
    mode: StalkerMode,
    view: StalkerView,
    boatCenter: THREE.Vector3,
    frame: BoatFrame,
  ): boolean {
    this.phase = 'versteckt';
    this.fade = 0;
    this.setOpacity(0);
    return this.spawn(view, boatCenter, frame, mode);
  }
}
