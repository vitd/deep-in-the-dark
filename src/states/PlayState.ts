import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Game } from '../Game';
import { MouseLook } from '../player/MouseLook';
import { PlayerController, PlayerState } from '../player/PlayerController';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { Stats } from '../systems/Stats';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { World } from '../world/World';
import { GameState } from './GameState';
import { PauseState } from './PauseState';

// Der eigentliche Spielzustand: besitzt Szene, Welt, Spieler und Systeme.
// Bleibt beim Pausieren am Leben (exit/enter), dispose() räumt endgültig auf.

export class PlayState implements GameState {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly world: World;
  private readonly look = new MouseLook();
  private readonly player: PlayerController;
  private readonly interaction = new InteractionSystem();
  private readonly inventory = new Inventory();
  private readonly stats = new Stats();
  private readonly keys = new Set<string>();
  private readonly eyeTmp = new THREE.Vector3();
  private exhaustedToastTimer = 0;

  private inventoryOpen = false;
  private expectUnlock = false;
  private active = false;
  private disposed = false;

  // Debug (?debug in der URL): FPS, Spielerzustand, Kollisions-Helfer
  private readonly debugEnabled = new URLSearchParams(window.location.search).has('debug');
  private fpsTime = 0;
  private fpsFrames = 0;
  private fps = 0;

  constructor(private readonly game: Game) {
    this.camera = new THREE.PerspectiveCamera(
      70,
      CONFIG.render.width / CONFIG.render.height,
      0.1,
      CONFIG.render.farPlane,
    );

    this.world = new World(this.scene, this.interaction, this.inventory, (ladder) =>
      this.player.startClimb(ladder),
    );
    this.player = new PlayerController(this.look, this.world.collision, this.world.ocean);

    // Klick auf einen Inventar-Slot: Fische kann man essen.
    this.inventory.onUse = (id) => {
      if (id !== 'fisch') return;
      if (this.inventory.consume('fisch')) {
        this.stats.eatFish();
        UI.toast(STR.fischGegessen(CONFIG.stats.nahrungProFisch));
      }
    };

    // Spawn: schwimmend nahe der Klippen, Blick Richtung Boot (+x)
    const s = CONFIG.world.spawn;
    this.player.position.set(s.x, CONFIG.world.seaLevel - 1.3, s.z);
    this.look.yaw = -Math.PI / 2;

    if (this.debugEnabled) {
      for (const box of this.world.collision.boxes) {
        this.scene.add(new THREE.Box3Helper(box, 0xffff00));
      }
    }
  }

  // ---------- Eingabe ----------

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'KeyI') {
      e.preventDefault();
      this.toggleInventory();
      return;
    }
    if (e.code === 'Escape' && this.inventoryOpen) {
      this.toggleInventory();
      return;
    }
    if (e.code === 'KeyE' && !this.inventoryOpen) {
      this.interaction.interact();
      return;
    }
    if (e.code === 'KeyT' && this.debugEnabled) {
      // Debug-Teleport aufs Deck
      this.player.position.set(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y + 1.6, CONFIG.world.boatPos.z + 10);
      this.player.state = PlayerState.Walk;
    }
    if (e.code === 'KeyF' && this.debugEnabled) {
      // Debug-Teleport zum nächsten Fisch
      const p = this.world.nearestFishPos(this.player.position);
      if (p) {
        this.player.position.set(p.x - 2, p.y - 1.2, p.z);
        this.player.state = PlayerState.Dive;
      }
    }
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onPointerLockChange = () => {
    const locked = document.pointerLockElement !== null;
    if (locked) return;
    if (this.expectUnlock) {
      this.expectUnlock = false;
      return;
    }
    if (this.active && !this.inventoryOpen) {
      this.game.setState(new PauseState(this.game, this));
    }
  };

  private readonly onCanvasClick = () => {
    if (this.active && !this.inventoryOpen && document.pointerLockElement === null) {
      this.lockPointer();
    }
  };

  private lockPointer(): void {
    // In neueren Browsern gibt requestPointerLock ein Promise zurück,
    // das z. B. ohne User-Geste rejecten kann – das darf nicht crashen.
    try {
      const result = this.game.canvas.requestPointerLock() as unknown;
      (result as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      // Pointer-Lock nicht verfügbar – Spiel bleibt trotzdem bedienbar
    }
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    UI.setVisible(UI.inventory, this.inventoryOpen);
    if (this.inventoryOpen) {
      this.inventory.renderUI();
      this.expectUnlock = true;
      document.exitPointerLock();
    } else {
      this.lockPointer();
    }
  }

  // ---------- Zustands-Lebenszyklus ----------

  enter(): void {
    this.active = true;
    UI.show(UI.hud);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.addEventListener('click', this.onCanvasClick);
    this.look.attach();
    this.lockPointer();
    if (this.debugEnabled) UI.show(UI.debug);
  }

  exit(): void {
    this.active = false;
    this.keys.clear();
    this.look.detach();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.removeEventListener('click', this.onCanvasClick);
    if (this.inventoryOpen) {
      this.inventoryOpen = false;
      UI.hide(UI.inventory);
    }
    UI.hide(UI.hud);
    UI.hide(UI.debug);
    UI.setPrompt(null);
    UI.hide(UI.underwater);
  }

  // Endgültiges Aufräumen beim Rückweg ins Hauptmenü.
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.interaction.clear();
    this.world.collision.clear();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.scene.clear();
  }

  // ---------- Loop ----------

  update(dt: number): void {
    if (this.inventoryOpen) return; // Spielwelt pausiert bei offenem Inventar

    this.player.update(dt, this.keys);
    this.player.eye(this.eyeTmp);
    this.look.applyTo(this.camera, this.eyeTmp);

    // Über-/Unterwasser-Umschaltung exakt an der Augenhöhe
    const waveAtEye = this.world.ocean.height(this.eyeTmp.x, this.eyeTmp.z);
    const eyesUnderwater = this.eyeTmp.y < waveAtEye;
    this.world.setUnderwater(eyesUnderwater);

    // Überlebenswerte: Nahrung (Anstrengung) und Luft (Tauchen)
    const moving =
      this.keys.has('KeyW') || this.keys.has('KeyA') ||
      this.keys.has('KeyS') || this.keys.has('KeyD');
    this.stats.update(dt, this.player.state, moving, eyesUnderwater);
    this.player.speedFactor = this.stats.exhausted ? CONFIG.stats.erschoepftTempo : 1;
    UI.setBar(UI.barNahrung, this.stats.nahrung);
    UI.setBar(UI.barLuft, this.stats.luft);
    // Vignette bei knapper Luft (ab 40 zunehmend dunkler)
    UI.setLowAir(this.stats.luft < 40 ? (1 - this.stats.luft / 40) * 0.9 : 0);
    if (this.stats.exhausted) {
      this.exhaustedToastTimer -= dt;
      if (this.exhaustedToastTimer <= 0) {
        UI.toast(STR.erschoepft);
        this.exhaustedToastTimer = 8;
      }
    }

    this.world.update(dt);

    this.interaction.update(this.camera);
    UI.setPrompt(this.interaction.promptText());

    if (this.debugEnabled) this.updateDebug(dt);
  }

  private updateDebug(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    const p = this.player.position;
    UI.debug.textContent =
      `FPS ${this.fps}\n` +
      `Zustand ${this.player.state}\n` +
      `Pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
      `T: Deck · F: Fisch`;
  }

  render(): void {
    this.game.pixelRenderer.render(this.scene, this.camera);
  }
}
