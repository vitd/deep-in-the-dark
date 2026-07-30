import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Game } from '../Game';
import { MouseLook } from '../player/MouseLook';
import { PlayerController, PlayerState } from '../player/PlayerController';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { Crafting } from '../systems/Crafting';
import { Hotbar, HOTBAR_SLOTS } from '../systems/Hotbar';
import { Stats } from '../systems/Stats';
import { isTouchDevice, TouchControls } from '../systems/TouchControls';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';
import { World } from '../world/World';
import { DeathState } from './DeathState';
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
  private readonly isTouch = isTouchDevice();
  private readonly touch: TouchControls | null = null;

  private inventoryOpen = false;
  private readonly crafting = new Crafting(this.inventory);
  private craftingOpen = false;
  private readonly hotbar = new Hotbar();
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

    this.world = new World(this.scene, this.interaction, this.inventory, () =>
      this.openCrafting(),
    );
    this.player = new PlayerController(
      this.look,
      this.world.collision,
      this.world.ocean,
      this.world.ladders,
    );

    if (this.isTouch) {
      this.touch = new TouchControls(this.keys, this.look, {
        onInteract: () => {
          if (!this.inventoryOpen) this.interaction.interact();
        },
        onToggleInventory: () => this.toggleInventory(),
        onPause: () => this.game.setState(new PauseState(this.game, this)),
      });
    }

    // Klick auf einen Inventar-Slot: Item ins Schnellinventar verschieben
    this.inventory.onUse = (id) => {
      if (this.hotbar.add(id)) {
        this.inventory.consume(id);
        this.renderHotbarOverlay();
      } else {
        UI.toast(STR.hotbarFull);
      }
    };

    // Taste 1-6 bzw. Antippen eines Hotbar-Slots: Essbares wird gegessen
    this.hotbar.onUse = (id) => {
      const plus =
        id === 'fisch'
          ? CONFIG.stats.nahrungProFisch
          : id === 'grossfisch'
            ? CONFIG.stats.nahrungProGrossfisch
            : 0;
      if (plus === 0) return false; // nicht essbar: nur auswählen
      this.stats.eat(plus);
      UI.toast(STR.gegessen(STR.itemNames[id], plus));
      return true;
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
    if (this.craftingOpen) {
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyE') {
        e.preventDefault();
        this.crafting.close();
      }
      return;
    }
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
    // Tasten 1-6: Schnellinventar benutzen
    if (!this.inventoryOpen && e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= HOTBAR_SLOTS) {
        this.hotbar.use(n - 1);
        return;
      }
    }
    if (e.code === 'KeyB' && this.debugEnabled) {
      // Debug: Material für den Hammer ins Inventar legen
      for (let i = 0; i < 3; i++) this.inventory.add('eisen');
      this.inventory.add('holzplanke');
      this.inventory.add('holzplanke');
      UI.toast('Debug: 3x Eisen, 2x Holzplanke');
    }
    if (e.code === 'KeyT' && this.debugEnabled) {
      // Debug-Teleport aufs Deck
      this.player.position.set(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y + 1.6, CONFIG.world.boatPos.z + 11.2);
      this.player.state = PlayerState.Walk;
    }
    if (e.code === 'KeyL' && this.debugEnabled) {
      // Debug: Luftnot simulieren
      this.stats.luft = Math.min(this.stats.luft, 8);
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
    if (this.active && !this.inventoryOpen && !this.craftingOpen) {
      this.game.setState(new PauseState(this.game, this));
    }
  };

  private readonly onInvClose = () => {
    if (this.inventoryOpen) this.toggleInventory();
  };

  private readonly onCanvasClick = () => {
    if (this.active && !this.inventoryOpen && document.pointerLockElement === null) {
      this.lockPointer();
    }
  };

  private lockPointer(): void {
    if (this.isTouch) return; // auf Touch-Geräten gibt es keinen Pointer-Lock
    // In neueren Browsern gibt requestPointerLock ein Promise zurück,
    // das z. B. ohne User-Geste rejecten kann – das darf nicht crashen.
    try {
      const result = this.game.canvas.requestPointerLock() as unknown;
      (result as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      // Pointer-Lock nicht verfügbar – Spiel bleibt trotzdem bedienbar
    }
  }

  private openCrafting(): void {
    if (this.craftingOpen) return;
    if (this.inventoryOpen) this.toggleInventory();
    this.craftingOpen = true;
    if (!this.isTouch) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
    this.crafting.open(() => {
      this.craftingOpen = false;
      if (this.active) this.lockPointer();
    });
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    UI.setVisible(UI.inventory, this.inventoryOpen);
    if (this.inventoryOpen) {
      this.inventory.renderUI();
      this.renderHotbarOverlay();
      if (!this.isTouch) {
        this.expectUnlock = true;
        document.exitPointerLock();
      }
    } else {
      this.lockPointer();
    }
  }

  // Schnellinventar-Zeile im Inventar-Overlay: Klick nimmt zurück
  private renderHotbarOverlay(): void {
    this.hotbar.renderOverlay((index) => {
      const id = this.hotbar.peek(index);
      if (!id) return;
      if (this.inventory.add(id)) {
        this.hotbar.removeOne(index);
        this.renderHotbarOverlay();
      } else {
        UI.toast(STR.inventoryFull);
      }
    });
  }

  // ---------- Zustands-Lebenszyklus ----------

  enter(): void {
    this.active = true;
    UI.show(UI.hud);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.addEventListener('click', this.onCanvasClick);
    document.getElementById('btn-inv-close')!.addEventListener('click', this.onInvClose);
    this.look.attach();
    this.hotbar.renderHUD();
    this.lockPointer();
    if (this.isTouch && this.touch) {
      UI.show(document.getElementById('touch-ui')!);
      this.touch.attach();
    }
    if (this.debugEnabled) UI.show(UI.debug);
  }

  exit(): void {
    this.active = false;
    if (this.touch) {
      this.touch.detach();
      UI.hide(document.getElementById('touch-ui')!);
    }
    this.keys.clear();
    this.look.detach();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.removeEventListener('click', this.onCanvasClick);
    document.getElementById('btn-inv-close')!.removeEventListener('click', this.onInvClose);
    if (this.inventoryOpen) {
      this.inventoryOpen = false;
      UI.hide(UI.inventory);
    }
    if (this.craftingOpen) this.crafting.close();
    UI.hide(UI.hud);
    UI.hide(UI.debug);
    UI.setPrompt(null);
    UI.hide(UI.underwater);
    UI.hide(UI.warnTauchauf);
    UI.hide(UI.drownTimer);
    this.game.canvas.style.filter = '';
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
    // Spielwelt pausiert bei offenem Inventar oder offener Werkbank
    if (this.inventoryOpen || this.craftingOpen) return;

    this.player.update(dt, this.keys);
    this.player.eye(this.eyeTmp);
    this.look.applyTo(this.camera, this.eyeTmp);

    // Über-/Unterwasser: im Tauchzustand gilt der Kopf immer als unter
    // Wasser (dieser Zustand endet erst, wenn er wirklich auftaucht) –
    // sonst könnte eine Welle über dem Kopf kurz "aufgetaucht" melden
    // und dabei Luft auffüllen oder den Ertrinken-Countdown abbrechen.
    const waveAtEye = this.world.ocean.height(this.eyeTmp.x, this.eyeTmp.z);
    const eyesUnderwater =
      this.player.state === PlayerState.Dive || this.eyeTmp.y < waveAtEye;
    this.world.setUnderwater(eyesUnderwater);

    // Überlebenswerte: Nahrung (Anstrengung) und Luft (Tauchen)
    const moving =
      this.keys.has('KeyW') || this.keys.has('KeyA') ||
      this.keys.has('KeyS') || this.keys.has('KeyD') ||
      this.player.climbMoving; // Klettern läuft auch ohne Taste
    this.stats.update(dt, this.player.state, moving, eyesUnderwater);
    this.player.speedFactor = this.stats.exhausted ? CONFIG.stats.erschoepftTempo : 1;
    UI.setBar(UI.barNahrung, this.stats.nahrung);
    UI.setBar(UI.barLuft, this.stats.luft);
    this.updateAirEffects(eyesUnderwater);
    if (this.stats.drowned) {
      this.game.setState(new DeathState(this.game, this));
      return;
    }
    if (this.stats.exhausted) {
      this.exhaustedToastTimer -= dt;
      if (this.exhaustedToastTimer <= 0) {
        UI.toast(STR.erschoepft);
        this.exhaustedToastTimer = 8;
      }
    }

    this.world.update(dt);

    this.interaction.update(this.camera);
    // Wer auf der Leiter hängt, ohne zu klettern, bekommt die
    // Blicksteuerung erklärt – sobald es losgeht, ist der Hinweis weg.
    const hanging = this.player.state === PlayerState.Climb && !this.player.climbMoving;
    UI.setPrompt(hanging ? STR.climbHint : this.interaction.promptText());

    if (this.debugEnabled) this.updateDebug(dt);
  }

  // Sicht-Effekte bei Luftnot: Vignette < 25, Unschärfe < 10,
  // Warnung + Ertrinken-Countdown bei 0.
  private updateAirEffects(underwater: boolean): void {
    const S = CONFIG.stats;
    const luft = this.stats.luft;

    UI.setLowAir(luft < S.luftVignetteAb ? 1 - luft / S.luftVignetteAb : 0);

    const blur = luft < S.luftUnschaerfeAb ? (1 - luft / S.luftUnschaerfeAb) * 4 : 0;
    this.game.canvas.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : '';

    const drowning = underwater && luft <= 0 && this.stats.drownTimer !== null;
    UI.setVisible(UI.warnTauchauf, drowning);
    UI.setVisible(UI.drownTimer, drowning);
    if (drowning) {
      UI.drownTimer.textContent = String(Math.ceil(this.stats.drownTimer!));
    }
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
      `Luft ${this.stats.luft.toFixed(1)} Ertrinken ${this.stats.drownTimer?.toFixed(1) ?? '-'}\n` +
      `T: Deck · F: Fisch · L: Luftnot`;
  }

  render(): void {
    this.game.pixelRenderer.render(this.scene, this.camera);
  }
}
