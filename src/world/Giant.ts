import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { BoatFrame } from './BoatFrame';
import { insideLake } from './lake';

// Der Riese (giant.glb): steht in der Mitte des Sees bis zur Hüfte im
// Wasser, der Kopf ragt so hoch auf wie die Maulspitze des Bosses beim
// Durchbruch (CONFIG.giant.kopfHoehe). Die Beine sieht man nie: alles
// unter der Wasserlinie wird weggeschnitten (Clipping-Ebene), und wer in
// seiner Nähe taucht, steckt in trübem Wasser (World.update).
//
// Ablauf:
//   'lauert'   – unsichtbar unter Wasser, bis der Spieler der Seemitte
//                nahe kommt (weckRadius)
//   'erhebt'   – spawn-Animation: die Glieder steigen aus der Tiefe
//   'steht'    – dreht sich zum Spieler, watet langsam auf ihn zu
//   'schlaegt' – attack-Animation: Arm hoch über den Kopf, dann klatscht
//                der Unterarm flach aufs Wasser. Wer im Aufschlagfeld
//                ist (an der Oberfläche oder an Deck), ist sofort tot.
//   'sinkt'    – Spieler weit weg: spawn-Animation rückwärts, zurück
//                in 'lauert'
//
// Wer tiefer als `tauchSchutz` taucht, ist vor ihm sicher – dort
// erreicht ihn der Schlag nicht, und der Riese greift gar nicht erst an.

const G = CONFIG.giant;

// Maße aus dem Modell (Blockbench-Einheiten, Ruhepose, Gesicht nach -z):
// Unterkante -0.13, Hüfte 11.0 (Oberkante Beine 10.94, Unterkante Rumpf
// 11.0), Scheitel 20.56.
const MODELL_UNTEN = -0.13;
const MODELL_HUEFTE = 11.0;
const MODELL_OBEN = 20.56;
const SKALA = G.kopfHoehe / (MODELL_OBEN - MODELL_HUEFTE); // Meter je Einheit
const HOEHE = (MODELL_OBEN - MODELL_UNTEN) * SKALA;
// loadModel zentriert das Modell: Hüfte über dem Gruppen-Ursprung
const HUEFTE_UEBER_MITTE = (MODELL_HUEFTE - (MODELL_UNTEN + MODELL_OBEN) / 2) * SKALA;

// attack-Clip: der Unterarm schlägt bei t = 0.985 s aufs Wasser (Unterkante
// des Handblocks kreuzt die Hüfthöhe). Er landet flach, links vor dem
// Riesen: seitlich 4.44 Einheiten, nach vorn 1.4 bis 11.8 Einheiten.
const AUFSCHLAG_T = 0.985;
const STREIFEN_SEITE = 4.44 * SKALA;
const STREIFEN_VON = 1.4 * SKALA;
const STREIFEN_BIS = 11.8 * SKALA;
// Reichweite: so weit darf der Spieler weg sein, damit ein Drehen des
// Riesen den Streifen auf ihn legt
const REICH_MIN = Math.hypot(STREIFEN_SEITE, STREIFEN_VON + 4);
const REICH_MAX = Math.hypot(STREIFEN_SEITE, STREIFEN_BIS - 4);
const REICH_IDEAL = Math.hypot(STREIFEN_SEITE, (STREIFEN_VON + STREIFEN_BIS) / 2);

type Zustand = 'lauert' | 'erhebt' | 'steht' | 'schlaegt' | 'sinkt';

export interface GiantZiel {
  pos: THREE.Vector3; // Spielerposition (Füße)
}

export class Giant {
  readonly group = new THREE.Group();
  private readonly modell = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private spawnAktion: THREE.AnimationAction | null = null;
  private angriffAktion: THREE.AnimationAction | null = null;
  private handblock: THREE.Mesh | null = null;
  private zustand: Zustand = 'lauert';
  private yaw = 0; // Blickrichtung: vorwärts = (-sin, -cos) wie Spieler/Boot
  private pause = 0;
  private zeit = 0;
  private readonly spritzer: Spritzer;
  private readonly tmp = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly ecke = new THREE.Vector3();
  private readonly lokal = new THREE.Vector3();
  // Clipping: alles unter der Wasserlinie wird nicht gezeichnet
  // (Ebene behält alles mit y + constant >= 0)
  private readonly wasserlinie = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -(CONFIG.world.seaLevel - G.schnittTiefe),
  );

  constructor(
    scene: THREE.Scene,
    private readonly onAuftauchen: () => void,
    private readonly onTreffer: () => void,
    private readonly onSchlag: (x: number, z: number, entfernung: number) => void,
  ) {
    this.group.position.set(G.x, CONFIG.world.seaLevel - HUEFTE_UEBER_MITTE, G.z);
    this.group.visible = false;
    this.group.add(this.modell);
    scene.add(this.group);
    this.spritzer = new Spritzer(scene);

    loadModel('giant.glb', HOEHE)
      .then(({ template, clips }) => {
        const m = template.clone(true);
        m.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const kopie = (mat: THREE.Material): THREE.Material => {
            const c = mat.clone();
            c.clippingPlanes = [this.wasserlinie];
            return c;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(kopie) : kopie(mesh.material);
          mesh.frustumCulled = false; // Glieder fahren beim Auftauchen weit
        });
        this.modell.add(m);
        // Handblock = das höchste Mesh unter dem schlagenden Arm (group6)
        const arm = m.getObjectByName('group6');
        let beste = -1;
        arm?.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.computeBoundingBox();
          const h = mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y;
          if (h > beste) {
            beste = h;
            this.handblock = mesh;
          }
        });
        this.mixer = new THREE.AnimationMixer(m);
        const spawn = THREE.AnimationClip.findByName(clips, 'spawn');
        const attack = THREE.AnimationClip.findByName(clips, 'attack');
        if (spawn) {
          this.spawnAktion = this.mixer.clipAction(spawn);
          this.spawnAktion.setLoop(THREE.LoopOnce, 1);
          this.spawnAktion.clampWhenFinished = true;
        }
        if (attack) {
          this.angriffAktion = this.mixer.clipAction(attack);
          this.angriffAktion.setLoop(THREE.LoopOnce, 1);
          this.angriffAktion.clampWhenFinished = false;
        }
      })
      .catch(() => {
        // Ohne Modell kein Riese – das Spiel läuft ohne ihn weiter
      });
  }

  get sichtbar(): boolean {
    return this.zustand !== 'lauert';
  }

  get zustandName(): string {
    return this.zustand;
  }

  // Wie stark das Wasser um den Riesen getrübt ist (0..1) – für den
  // Unterwasser-Nebel in World
  truebung(x: number, z: number): number {
    const d = Math.hypot(x - this.group.position.x, z - this.group.position.z);
    return 1 - THREE.MathUtils.smoothstep(d, G.truebRadius, G.truebRadius + G.truebAuslauf);
  }

  update(dt: number, ziel: GiantZiel): void {
    this.zeit += dt;
    this.spritzer.update(dt);
    if (!this.mixer) return;
    this.mixer.update(dt);
    const pos = this.group.position;
    const dx = ziel.pos.x - pos.x;
    const dz = ziel.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    // Wer tief taucht, ist für ihn nicht da
    const erreichbar = ziel.pos.y > CONFIG.world.seaLevel - G.tauchSchutz;

    switch (this.zustand) {
      case 'lauert':
        if (d < G.weckRadius) this.erheben();
        return;

      case 'erhebt':
        this.dreheZu(this.wunschYaw(dx, dz, d), dt);
        if (!this.spawnAktion || !this.spawnAktion.isRunning()) {
          this.zustand = 'steht';
          this.pause = 1.5;
        }
        break;

      case 'steht': {
        if (d > G.aufgebenRadius) {
          this.versinken();
          return;
        }
        this.pause = Math.max(0, this.pause - dt);
        const soll = this.wunschYaw(dx, dz, d);
        this.dreheZu(soll, dt);
        this.waten(dx, dz, d, dt);
        const ausgerichtet = Math.abs(winkelDiff(soll, this.yaw)) < 0.06;
        if (erreichbar && this.pause <= 0 && ausgerichtet && d > REICH_MIN && d < REICH_MAX) {
          this.ausholen();
        }
        break;
      }

      case 'schlaegt': {
        const a = this.angriffAktion!;
        // Aufschlag: in genau dem Bild, in dem die Clip-Zeit ihn überschreitet
        const t = a.time;
        const vorher = t - dt * a.getEffectiveTimeScale();
        if (vorher < AUFSCHLAG_T && t >= AUFSCHLAG_T) this.aufschlag(ziel, erreichbar);
        if (!a.isRunning() || t >= a.getClip().duration - 1e-3) {
          a.stop();
          this.zustand = 'steht';
          this.pause = G.pause;
        }
        break;
      }

      case 'sinkt':
        // Kommt der Spieler zurück, bevor er ganz unten ist: wieder hoch
        if (d < G.weckRadius && this.spawnAktion) {
          this.zustand = 'erhebt';
          this.spawnAktion.timeScale = G.auftauchTempo;
          this.onAuftauchen();
          break;
        }
        if (!this.spawnAktion || !this.spawnAktion.isRunning() || this.spawnAktion.time <= 0) {
          this.zustand = 'lauert';
          this.group.visible = false;
        }
        break;
    }

    // Etwas Leben in die Ruhepose: langsames Wiegen im Wasser
    this.modell.rotation.z = Math.sin(this.zeit * 0.35) * 0.012;
    this.modell.position.y = Math.sin(this.zeit * 0.5) * 0.6;
    this.group.rotation.y = this.yaw;
  }

  // ---------- Bewegung ----------

  // Blickrichtung, in der der Aufschlagstreifen auf dem Spieler liegt.
  // Der Streifen liegt links vor dem Riesen; bei zu kurzer Entfernung
  // schaut er den Spieler einfach an.
  private wunschYaw(dx: number, dz: number, d: number): number {
    const direkt = Math.atan2(-dx, -dz);
    if (d <= STREIFEN_SEITE + 1) return direkt;
    // Spieler liegt bei yaw = direkt + delta auf lokal x = -STREIFEN_SEITE
    const delta = Math.asin(STREIFEN_SEITE / d);
    // beide Vorzeichen prüfen, das mit dem Spieler links nehmen
    for (const s of [1, -1]) {
      const y = direkt + s * delta;
      const lx = dx * Math.cos(y) - dz * Math.sin(y);
      if (lx < 0) return y;
    }
    return direkt;
  }

  private dreheZu(soll: number, dt: number): void {
    const diff = winkelDiff(soll, this.yaw);
    const schritt = G.drehTempo * dt;
    this.yaw += Math.abs(diff) <= schritt ? diff : Math.sign(diff) * schritt;
  }

  // Auf die ideale Schlagweite waten – nie aus seinem Revier hinaus
  private waten(dx: number, dz: number, d: number, dt: number): void {
    if (d < 1) return;
    const fehl = d - REICH_IDEAL;
    if (Math.abs(fehl) < 6) return;
    const schritt = Math.sign(fehl) * Math.min(Math.abs(fehl), G.watTempo * dt);
    const nx = this.group.position.x + (dx / d) * schritt;
    const nz = this.group.position.z + (dz / d) * schritt;
    const vomZentrum = Math.hypot(nx - G.x, nz - G.z);
    if (vomZentrum > G.revierRadius || !insideLake(nx, nz, G.koerperRadius + 10)) return;
    this.group.position.x = nx;
    this.group.position.z = nz;
  }

  // ---------- Ablauf ----------

  private erheben(): void {
    if (!this.spawnAktion) return;
    this.zustand = 'erhebt';
    this.group.visible = true;
    this.group.position.x = G.x;
    this.group.position.z = G.z;
    this.spawnAktion.reset();
    this.spawnAktion.timeScale = G.auftauchTempo;
    this.spawnAktion.play();
    this.onAuftauchen();
  }

  private versinken(): void {
    if (!this.spawnAktion) {
      this.zustand = 'lauert';
      this.group.visible = false;
      return;
    }
    this.zustand = 'sinkt';
    this.angriffAktion?.stop();
    // die Auftauch-Animation rückwärts: die Glieder sinken in die Tiefe
    this.spawnAktion.paused = false;
    this.spawnAktion.enabled = true;
    this.spawnAktion.time = this.spawnAktion.getClip().duration;
    this.spawnAktion.timeScale = -G.auftauchTempo;
    this.spawnAktion.play();
  }

  // Ab hier ist die Richtung fest: wer quer zum Streifen ausweicht, lebt
  private ausholen(): void {
    if (!this.angriffAktion) return;
    this.zustand = 'schlaegt';
    this.angriffAktion.reset();
    this.angriffAktion.timeScale = G.angriffTempo;
    this.angriffAktion.play();
  }

  // Der Unterarm klatscht aufs Wasser: Feld bestimmen, Spieler prüfen
  private aufschlag(ziel: GiantZiel, erreichbar: boolean): void {
    if (!this.handblock) return;
    this.group.updateMatrixWorld(true);
    // Aufschlagfeld = Grundriss des Handblocks im Rahmen des Riesen
    this.inv.copy(this.group.matrixWorld).invert();
    const bb = this.handblock.geometry.boundingBox!;
    this.box.makeEmpty();
    for (let k = 0; k < 8; k++) {
      this.ecke.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z);
      this.ecke.applyMatrix4(this.handblock.matrixWorld).applyMatrix4(this.inv);
      this.box.expandByPoint(this.ecke);
    }
    // Mitte des Feldes auf dem Wasser (Welt) – für Spritzer und Ton
    this.box.getCenter(this.tmp);
    this.tmp.y = this.box.min.y;
    this.tmp.applyMatrix4(this.group.matrixWorld);
    const feldX = this.tmp.x;
    const feldZ = this.tmp.z;
    // Feldmaße sind schon Meter (die Skalierung steckt im Modell)
    this.spritzer.start(feldX, feldZ, this.yaw, this.box.max.z - this.box.min.z, this.box.max.x - this.box.min.x);
    this.onSchlag(feldX, feldZ, Math.hypot(ziel.pos.x - feldX, ziel.pos.z - feldZ));

    if (!erreichbar) return;
    // Spieler in den Rahmen des Riesen und gegen das Feld prüfen
    this.lokal.copy(ziel.pos).applyMatrix4(this.inv);
    const r = G.trefferRand;
    if (
      this.lokal.x > this.box.min.x - r && this.lokal.x < this.box.max.x + r &&
      this.lokal.z > this.box.min.z - r && this.lokal.z < this.box.max.z + r
    ) {
      this.onTreffer();
    }
  }

  // ---------- Kollision ----------

  // Boot aus dem Körper des Riesen drücken; true = Pose geändert
  schiebeBoot(frame: BoatFrame): boolean {
    if (this.zustand === 'lauert') return false;
    const bx = frame.center.x + frame.offset.x;
    const bz = frame.center.z + frame.offset.z;
    const dx = bx - this.group.position.x;
    const dz = bz - this.group.position.z;
    const d = Math.hypot(dx, dz);
    const min = G.koerperRadius + 12; // halbe Bootslänge + Marge
    if (d >= min) return false;
    const k = d > 0.01 ? (min - d) / d : 1;
    frame.offset.x += (d > 0.01 ? dx : 1) * k;
    frame.offset.z += (d > 0.01 ? dz : 0) * k;
    return true;
  }

  // Schwimmer aus dem Körper schieben (Position wird verändert)
  schiebeSchwimmer(p: THREE.Vector3): void {
    if (this.zustand === 'lauert') return;
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    const d = Math.hypot(dx, dz);
    const min = G.koerperRadius + 0.5;
    if (d >= min || d < 0.01) return;
    p.x = this.group.position.x + (dx / d) * min;
    p.z = this.group.position.z + (dz / d) * min;
  }

  // ---------- Cheats ----------

  // Sofort in voller Größe dastehen (ohne Auftauchen)
  erscheineSofort(): void {
    if (!this.spawnAktion) return;
    this.group.visible = true;
    this.spawnAktion.reset();
    this.spawnAktion.play();
    this.spawnAktion.time = this.spawnAktion.getClip().duration;
    this.mixer?.update(0);
    this.zustand = 'steht';
    this.pause = 1;
  }

  get reichweite(): { min: number; ideal: number; max: number } {
    return { min: REICH_MIN, ideal: REICH_IDEAL, max: REICH_MAX };
  }
}

function winkelDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Wasserfontäne beim Aufschlag: ein Schwall Tropfen entlang des
// Unterarms, dazu ein weißer Ring, der sich ausbreitet und verblasst
class Spritzer {
  private readonly punkte: THREE.Points;
  private readonly ring: THREE.Mesh;
  private readonly vel: Float32Array;
  private readonly start0: Float32Array;
  private alter = 99;
  private static readonly N = 700;
  private static readonly DAUER = 2.6;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Spritzer.N * 3), 3));
    this.vel = new Float32Array(Spritzer.N * 3);
    this.start0 = new Float32Array(Spritzer.N * 3);
    this.punkte = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xe8f4f8, size: 1.6, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.punkte.frustumCulled = false;
    this.punkte.visible = false;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.visible = false;
    scene.add(this.punkte, this.ring);
  }

  // Feld: Mitte (x, z), längs in Blickrichtung des Riesen gedreht
  start(x: number, z: number, yaw: number, laenge: number, breiteMeter: number): void {
    this.alter = 0;
    const pos = this.punkte.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const breite = Math.max(6, breiteMeter);
    const y0 = CONFIG.world.seaLevel + 0.3;
    for (let i = 0; i < Spritzer.N; i++) {
      const l = (Math.random() - 0.5) * laenge;
      const q = (Math.random() - 0.5) * breite * 1.4;
      const px = x + fx * l + fz * q;
      const pz = z + fz * l - fx * q;
      this.start0[i * 3] = px;
      this.start0[i * 3 + 1] = y0;
      this.start0[i * 3 + 2] = pz;
      const aus = 4 + Math.random() * 10;
      const winkel = Math.random() * Math.PI * 2;
      this.vel[i * 3] = Math.cos(winkel) * aus;
      this.vel[i * 3 + 1] = 12 + Math.random() * 26;
      this.vel[i * 3 + 2] = Math.sin(winkel) * aus;
      pos.setXYZ(i, px, y0, pz);
    }
    pos.needsUpdate = true;
    this.punkte.visible = true;
    this.ring.position.set(x, CONFIG.world.seaLevel + 0.4, z);
    this.ring.visible = true;
  }

  update(dt: number): void {
    if (this.alter > Spritzer.DAUER) return;
    this.alter += dt;
    const t = this.alter;
    const pos = this.punkte.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < Spritzer.N; i++) {
      const y = this.start0[i * 3 + 1] + this.vel[i * 3 + 1] * t - 0.5 * 18 * t * t;
      pos.setXYZ(
        i,
        this.start0[i * 3] + this.vel[i * 3] * t,
        Math.max(CONFIG.world.seaLevel - 1, y),
        this.start0[i * 3 + 2] + this.vel[i * 3 + 2] * t,
      );
    }
    pos.needsUpdate = true;
    const k = t / Spritzer.DAUER;
    (this.punkte.material as THREE.PointsMaterial).opacity = 0.9 * (1 - k);
    const r = 20 + 90 * k;
    this.ring.scale.set(r, 1, r);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    if (t > Spritzer.DAUER) {
      this.punkte.visible = false;
      this.ring.visible = false;
    }
  }
}
