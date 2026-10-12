import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PlayState } from '../states/PlayState';
import { INNEN, RING } from '../world/TempelPlan';
import { loadModel } from '../rendering/Models';
import { pixelTexture } from '../rendering/Textures';

// ---------------------------------------------------------------------------
// Fotowerkzeug für reproduzierbare Vorher/Nachher-Aufnahmen (nur Entwicklung)
//
// Wird ausschließlich im Dev-Modus geladen (siehe src/main.ts) und über den
// URL-Parameter ?photo=... gesteuert. Es springt direkt ins Spiel, blendet das
// HUD aus und setzt feste Kameraposen. Mit ?seed=... werden alle Zufallswerte
// (Fisch-/Hai-Scharen, Kreaturenauftritte) deterministisch, damit zwei
// Aufnahmen desselben Standpunkts sich wirklich nur in der Optik unterscheiden.
//
// Das Werkzeug ist kein Teil des Spiels: Es greift nur auf die vorhandene
// Szene zu und ändert keine Spielmechanik.
// ---------------------------------------------------------------------------

interface PoseDef {
  name: string;
  eye: [number, number, number];
  ziel: [number, number, number];
  // false: Wellen/Kreaturen laufen weiter (für bewegte Motive wie Riese/Hai)
  frozen?: boolean;
  // Wartezeit in ms nach dem Setzen der Pose, bevor der Screenshot fällt
  // (z. B. bis der Riese sich erhoben oder der Boss aufgetaucht ist).
  warte?: number;
  // Katalog-Ansicht statt Weltstandpunkt
  katalog?: 'modelle' | 'texturen';
}

const W = CONFIG.world;
const L = W.lake;
const BOOT = W.boatPos;

// Alle mitgelieferten Modelle; Reihenfolge bestimmt die Anordnung im Katalog.
const MODELLE = [
  'fish.glb',
  'fish-big.glb',
  'shark.glb',
  'seamonster.glb',
  'seamonster-boss.glb',
  'giant.glb',
  'stalker.glb',
  'sunkey.glb',
  'barrel.glb',
  'barrel-fuel.glb',
  'battery.glb',
  'motor.glb',
  'motor-running.glb',
  'gold.glb',
  'iron.glb',
  'nyzerine.glb',
  'glyzerine.glb',
  'telephone.glb',
  'telephone-mount.glb',
];

const TEXTUREN = ['sand.png', 'stone.png', 'rock.png', 'water.png', 'plank.png', 'boat-wall.png', 'door.png'];

const KATALOG_URSPRUNG = new THREE.Vector3(0, 25, 0);
const KATALOG_AUGE: [number, number, number] = [0, 25, 15];

function winkelZu(eye: readonly number[], ziel: readonly number[]): { yaw: number; pitch: number } {
  const dx = ziel[0] - eye[0];
  const dy = ziel[1] - eye[1];
  const dz = ziel[2] - eye[2];
  const horiz = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, horiz) };
}

// Einfacher, seedbarer Zufallsgenerator (mulberry32). Ersetzt in der
// Entwicklung Math.random, damit Kreaturen an denselben Stellen erscheinen.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Feste Standpunkte je Elementklasse. Tempel und Kreaturen werden zur
// Laufzeit aus der Welt abgeleitet, damit die Standpunkte exakt stimmen.
function bauePosen(play: PlayState): PoseDef[] {
  const tempel = play.photoWorld.tempel;
  const punkt = (lx: number, ly: number, lz: number): [number, number, number] => {
    const p = tempel.welt(lx, ly, lz);
    return [p.x, p.y, p.z];
  };
  // Blick den Umgang entlang: an der Ringmitte stehen, in +z schauen
  const umgang = { eye: punkt(RING, 1.55, -20), ziel: punkt(RING, 1.4, 8) };
  const teleport = (
    tp: { pos: THREE.Vector3; yaw: number },
    vor = 0,
  ): { eye: [number, number, number]; ziel: [number, number, number] } => {
    const fx = -Math.sin(tp.yaw);
    const fz = -Math.cos(tp.yaw);
    const eye: [number, number, number] = [
      tp.pos.x + fx * vor,
      tp.pos.y + CONFIG.player.eyeHeight,
      tp.pos.z + fz * vor,
    ];
    return { eye, ziel: [eye[0] + fx * 8, eye[1], eye[2] + fz * 8] };
  };

  return [
    { name: 'klippen', eye: [-38, 1.4, 6], ziel: [-52, 25, 6] },
    { name: 'klippen_fuss', eye: [-44, -8, 10], ziel: [-56, -2, 8] },
    { name: 'boot_aussen', eye: [-46, 1.4, 16], ziel: [BOOT.x, 3, BOOT.z] },
    { name: 'boot_innen', eye: [BOOT.x, 3.6, -10.0], ziel: [BOOT.x, 2.2, 4] },
    { name: 'boot_motorraum', eye: [BOOT.x + 2.0, 3.05, 8.6], ziel: [BOOT.x, 2.6, 5.5] },
    { name: 'boot_bruecke', eye: [BOOT.x, 5.7, -6.6], ziel: [BOOT.x, 5.3, -20] },
    { name: 'oberflaeche', eye: [-48, 1.0, 30], ziel: [300, 0.2, -20] },
    { name: 'unterwasser_flach', eye: [-44, -5, 12], ziel: [-26, -9, 2] },
    { name: 'seeboden', eye: [-46, -10, 26], ziel: [-18, -11.5, 6] },
    { name: 'tiefsee', eye: [800, -25, 0], ziel: [1010, -95, 0] },
    { name: 'riese', eye: [860, 8, 0], ziel: [L.center.x, 45, 0], frozen: false, warte: 7000 },
    { name: 'seemonster', eye: [330, -1.0, 0], ziel: [360, -2, 0], frozen: false, warte: 1500 },
    { name: 'tempel', ...teleport(tempel.vorDemTor, -6) },
    { name: 'umgang', ...umgang },
    { name: 'tempel_ecke', eye: punkt(RING, 1.55, 26), ziel: punkt(INNEN - 1.6, 1.3, INNEN - 1.6) },
    { name: 'labyrinth', ...teleport(tempel.amLabyrinthEingang, 3) },
    { name: 'schatz', ...teleport(tempel.inDerSchatzkammer) },
    { name: 'katalog_modelle', eye: KATALOG_AUGE, ziel: [0, 25, 0], katalog: 'modelle' },
    { name: 'katalog_texturen', eye: KATALOG_AUGE, ziel: [0, 25, 0], katalog: 'texturen' },
  ];
}

export interface PhotoApi {
  posen: string[];
  pose(name: string): Promise<boolean>;
  freierBlick(x: number, y: number, z: number, yaw: number, pitch: number): void;
  gefroren(frozen: boolean): void;
  hud(an: boolean): void;
}

// Versteckt das HUD für reine Bildaufnahmen (siehe ui.css, body.photo-mode).
function setzeHud(an: boolean): void {
  document.body.classList.toggle('photo-mode', !an);
}

export function installiereFotoWerkzeug(play: PlayState, seed: number): PhotoApi {
  // Deterministische Zufallswerte, solange der Foto-Modus läuft.
  Math.random = seededRandom(seed);

  const posen = bauePosen(play);
  let katalogGruppe: THREE.Group | null = null;

  const katalogLeeren = (): void => {
    if (!katalogGruppe) return;
    play.photoScene.remove(katalogGruppe);
    katalogGruppe.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    katalogGruppe = null;
  };

  const baueKatalog = async (kind: 'modelle' | 'texturen'): Promise<void> => {
    katalogLeeren();
    const gruppe = new THREE.Group();
    katalogGruppe = gruppe;
    play.photoScene.add(gruppe);

    // Neutraler Boden und Rückwand als ruhiger Hintergrund
    const wandMat = new THREE.MeshLambertMaterial({ color: 0x20262c });
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), wandMat);
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(0, KATALOG_URSPRUNG.y - 3, 6);
    gruppe.add(boden);
    const rueck = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), wandMat);
    rueck.position.set(0, KATALOG_URSPRUNG.y + 3, -6);
    gruppe.add(rueck);

    // Kataloglicht – gleiche Richtung wie die Welt (siehe Art-Bible)
    const key = new THREE.DirectionalLight(0xfff2d8, 2.4);
    key.position.set(6, 14, 12);
    const fill = new THREE.DirectionalLight(0xbfd0d8, 0.7);
    fill.position.set(-8, 4, 8);
    gruppe.add(key, fill, new THREE.AmbientLight(0xcfdce4, 0.6));

    if (kind === 'texturen') {
      let i = 0;
      for (const datei of TEXTUREN) {
        const mat = new THREE.MeshLambertMaterial({ map: pixelTexture(datei, 1, 1) });
        const wand = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
        const spalte = i % 3;
        const zeile = Math.floor(i / 3);
        wand.position.set((spalte - 1) * 5, KATALOG_URSPRUNG.y + 1 - zeile * 5, -5.9);
        gruppe.add(wand);
        i++;
      }
      return;
    }

    let i = 0;
    for (const datei of MODELLE) {
      try {
        const { template } = await loadModel(datei, 3);
        const klon = template.clone(true);
        const spalte = i % 7;
        const zeile = Math.floor(i / 7);
        klon.position.set((spalte - 3) * 3.6, KATALOG_URSPRUNG.y + 1 - zeile * 3.6, 0);
        klon.rotation.y = -0.5;
        gruppe.add(klon);
      } catch {
        // Modell fehlt: überspringen
      }
      i++;
    }
  };

  const setzePose = async (name: string): Promise<boolean> => {
    const p = posen.find((x) => x.name === name);
    if (!p) return false;
    if (p.katalog) {
      await baueKatalog(p.katalog);
    } else {
      katalogLeeren();
    }
    const { yaw, pitch } = winkelZu(p.eye, p.ziel);
    play.photoPose(p.eye[0], p.eye[1], p.eye[2], yaw, pitch);
    play.photoSetFrozen(p.frozen !== false);
    if (p.warte) await new Promise((r) => window.setTimeout(r, p.warte));
    return true;
  };

  const api: PhotoApi = {
    posen: posen.map((p) => p.name),
    pose: (name) => setzePose(name),
    freierBlick: (x, y, z, yaw, pitch) => play.photoPose(x, y, z, yaw, pitch),
    gefroren: (frozen) => play.photoSetFrozen(frozen),
    hud: (an) => setzeHud(an),
  };

  setzeHud(false);
  void setzePose('klippen');
  return api;
}
