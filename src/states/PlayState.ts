import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Game } from '../Game';
import { HeldItem } from '../player/HeldItem';
import { MouseLook } from '../player/MouseLook';
import { PlayerController, PlayerState } from '../player/PlayerController';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { Audio } from '../systems/AudioManager';
import { Crafting } from '../systems/Crafting';
import { Hotbar, HOTBAR_SLOTS } from '../systems/Hotbar';
import { MotorMaterial, MotorRepair } from '../systems/MotorRepair';
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
  private readonly heldItem: HeldItem;
  private readonly motorRepair = new MotorRepair();
  private expectUnlock = false;
  private active = false;
  private disposed = false;

  // Cheat-Menü (Taste L) und Debug-Anzeigen – immer verfügbar
  private cheatsOpen = false;
  private debugVisible = false;
  private debugHelpers: THREE.Group | null = null;
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

    this.world = new World(
      this.scene,
      this.interaction,
      this.inventory,
      () => this.openCrafting(),
      () => this.onSharkBite(),
      (liter) => {
        this.stats.treibstoff += liter;
        UI.toast(STR.fuelFound(liter));
      },
      () => (this.motorRepair.complete ? STR.motorRunning : STR.motorApply),
      () => this.applyToMotor(),
    );

    // Kamera in die Szene hängen, damit das Hand-Item mitgerendert wird
    this.scene.add(this.camera);
    this.heldItem = new HeldItem(this.camera);
    this.hotbar.onChanged = () => this.heldItem.setItem(this.hotbar.selectedItem);
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
            : id === 'nahrung'
              ? CONFIG.stats.nahrungProKonserve
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

  }

  // ---------- Cheat-Menü (Taste L, immer verfügbar) ----------

  private cheatActions(): { label: string; action: () => void }[] {
    return [
      {
        label: 'Debug-Anzeige an/aus (FPS, Position)',
        action: () => {
          this.debugVisible = !this.debugVisible;
          UI.setVisible(UI.debug, this.debugVisible);
        },
      },
      {
        label: 'Kollisionsboxen an/aus',
        action: () => {
          if (!this.debugHelpers) {
            this.debugHelpers = new THREE.Group();
            for (const box of this.world.collision.boxes) {
              this.debugHelpers.add(new THREE.Box3Helper(box, 0xffff00));
            }
            this.scene.add(this.debugHelpers);
          } else {
            this.debugHelpers.visible = !this.debugHelpers.visible;
          }
        },
      },
      {
        label: 'Teleport: aufs Deck',
        action: () => {
          this.player.position.set(
            CONFIG.world.boatPos.x,
            CONFIG.world.boatPos.y + 1.6,
            CONFIG.world.boatPos.z + 11.2,
          );
          this.player.state = PlayerState.Walk;
        },
      },
      {
        label: 'Teleport: zum nächsten Fisch',
        action: () => {
          const p = this.world.nearestFishPos(this.player.position);
          if (p) {
            this.player.position.set(p.x - 2, p.y - 1.2, p.z);
            this.player.state = PlayerState.Dive;
          }
        },
      },
      {
        label: 'Werte auffüllen (Leben, Nahrung, Luft)',
        action: () => {
          this.stats.leben = 100;
          this.stats.nahrung = 100;
          this.stats.luft = 100;
          UI.toast('Cheat: Werte aufgefüllt');
        },
      },
      {
        label: 'Luftnot simulieren (Luft = 8)',
        action: () => {
          this.stats.luft = Math.min(this.stats.luft, 8);
        },
      },
      {
        label: 'Materialpaket (Hammer, Eisen, Planken, 2 Fässer)',
        action: () => {
          for (let i = 0; i < 3; i++) this.inventory.add('eisen');
          this.inventory.add('holzplanke');
          this.inventory.add('holzplanke');
          this.inventory.add('fass');
          this.inventory.add('fass');
          this.hotbar.add('hammer');
          UI.toast('Cheat: Material + Hammer + 2 Fässer');
        },
      },
      {
        label: '+100 L Treibstoff',
        action: () => {
          this.stats.treibstoff += 100;
          UI.toast('Cheat: +100 L Treibstoff');
        },
      },
      {
        label: 'Motor fast fertig (1 Glyzerin fehlt)',
        action: () => {
          this.motorRepair.apply('eisen', 50);
          this.motorRepair.apply('gold', 50);
          this.motorRepair.apply('nyzerin', 20);
          this.motorRepair.apply('glyzerin', 19);
          this.motorRepair.applyFuel(100);
          this.hotbar.add('glyzerin');
          UI.toast('Cheat: Motor fast fertig – 1 Glyzerin anwenden');
        },
      },
      {
        label: 'Hai herbeirufen',
        action: () => {
          this.world.shark.teleportNear(this.player.position);
          UI.toast('Cheat: Hai ist unterwegs');
        },
      },
    ];
  }

  private toggleCheats(): void {
    this.cheatsOpen = !this.cheatsOpen;
    UI.setVisible(UI.cheats, this.cheatsOpen);
    if (this.cheatsOpen) {
      UI.cheatList.innerHTML = '';
      for (const cheat of this.cheatActions()) {
        const btn = document.createElement('button');
        btn.textContent = cheat.label;
        btn.addEventListener('click', () => {
          cheat.action();
          if (this.cheatsOpen) this.toggleCheats();
        });
        UI.cheatList.append(btn);
      }
      if (!this.isTouch) {
        this.expectUnlock = true;
        document.exitPointerLock();
      }
    } else {
      this.lockPointer();
    }
  }

  // ---------- Eingabe ----------

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.cheatsOpen) {
      if (e.code === 'Escape' || e.code === 'KeyL') {
        e.preventDefault();
        this.toggleCheats();
      }
      return;
    }
    if (e.code === 'KeyL' && !this.inventoryOpen && !this.craftingOpen) {
      this.toggleCheats();
      return;
    }
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
      if (this.interaction.current) {
        this.interaction.interact();
      } else {
        // nichts anvisiert: mit dem Hammer zuschlagen (auch für Touch)
        this.swingHammer();
      }
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
    if (this.active && !this.inventoryOpen && !this.craftingOpen && !this.cheatsOpen) {
      this.game.setState(new PauseState(this.game, this));
    }
  };

  private readonly onInvClose = () => {
    if (this.inventoryOpen) this.toggleInventory();
  };

  private readonly onCheatsClose = () => {
    if (this.cheatsOpen) this.toggleCheats();
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

  // E am Motor: Treibstoff aus dem Vorrat + gewähltes Hotbar-Material anwenden
  private applyToMotor(): void {
    const m = this.motorRepair;
    if (m.complete) return;
    let didSomething = false;

    // Treibstoff fließt automatisch aus dem Vorrat
    const fuel = Math.min(this.stats.treibstoff, m.fuelRemaining);
    if (fuel > 0) {
      m.applyFuel(fuel);
      this.stats.treibstoff -= fuel;
      UI.toast(STR.motorFuelApplied(fuel));
      didSomething = true;
    }

    // gewähltes Material aus der Hotbar verbauen
    const id = this.hotbar.selectedItem;
    if (id && m.needs(id)) {
      const want = m.remaining(id as MotorMaterial);
      const taken = this.hotbar.takeSelected(want);
      if (taken > 0) {
        m.apply(id as MotorMaterial, taken);
        UI.toast(STR.motorApplied(STR.itemNames[id], taken));
        didSomething = true;
      }
    }

    if (!didSomething) {
      UI.toast(STR.motorNothingToApply);
    }
    m.renderPanel();

    if (m.complete) {
      this.world.startMotor();
      Audio.startHum();
      UI.toast(STR.motorComplete);
    }
  }

  private onSharkBite(): void {
    this.stats.damage(CONFIG.shark.damage);
    UI.damageFlash();
    UI.toast(STR.sharkBite(CONFIG.shark.damage));
  }

  // Hammerschlag: Hand-Animation + Abwehrversuch gegen den Hai
  private swingHammer(): void {
    if (this.hotbar.selectedItem !== 'hammer' || this.heldItem.isSwinging) return;
    this.heldItem.swing();
    this.player.eye(this.eyeTmp);
    const dir = this.look.forward(new THREE.Vector3());
    if (this.world.shark.trySwing(this.eyeTmp, dir)) {
      UI.toast(STR.sharkRepelled);
    }
  }

  private readonly onWheel = (e: WheelEvent) => {
    if (!this.active || this.inventoryOpen || this.craftingOpen || this.cheatsOpen) return;
    if (e.deltaY === 0) return;
    this.hotbar.scroll(e.deltaY > 0 ? 1 : -1);
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !this.active || this.inventoryOpen || this.craftingOpen || this.cheatsOpen) return;
    if (!this.isTouch && document.pointerLockElement === null) return; // Klick galt dem Re-Lock
    this.swingHammer();
  };

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
      UI.fuelLine.textContent = STR.fuelLabel(this.stats.treibstoff);
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
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('wheel', this.onWheel);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.addEventListener('click', this.onCanvasClick);
    document.getElementById('btn-inv-close')!.addEventListener('click', this.onInvClose);
    document.getElementById('btn-cheats-close')!.addEventListener('click', this.onCheatsClose);
    this.look.attach();
    this.hotbar.renderHUD();
    this.lockPointer();
    if (this.isTouch && this.touch) {
      UI.show(document.getElementById('touch-ui')!);
      this.touch.attach();
    }
    if (this.debugVisible) UI.show(UI.debug);
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
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.game.canvas.removeEventListener('click', this.onCanvasClick);
    document.getElementById('btn-inv-close')!.removeEventListener('click', this.onInvClose);
    document.getElementById('btn-cheats-close')!.removeEventListener('click', this.onCheatsClose);
    if (this.inventoryOpen) {
      this.inventoryOpen = false;
      UI.hide(UI.inventory);
    }
    if (this.craftingOpen) this.crafting.close();
    if (this.cheatsOpen) { this.cheatsOpen = false; UI.hide(UI.cheats); }
    UI.hide(UI.hud);
    UI.hide(UI.debug);
    UI.setPrompt(null);
    UI.hide(UI.underwater);
    UI.hide(UI.warnTauchauf);
    UI.hide(UI.drownTimer);
    UI.hide(UI.motorPanel);
    Audio.stopHum();
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
    if (this.inventoryOpen || this.craftingOpen || this.cheatsOpen) return;

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
    UI.setBar(UI.barLeben, this.stats.leben);
    this.updateAirEffects(eyesUnderwater);
    if (this.stats.drowned) {
      this.game.setState(new DeathState(this.game, this, STR.drownedTitle));
      return;
    }
    if (this.stats.leben <= 0) {
      this.game.setState(new DeathState(this.game, this, STR.diedTitle));
      return;
    }
    if (this.stats.exhausted) {
      this.exhaustedToastTimer -= dt;
      if (this.exhaustedToastTimer <= 0) {
        UI.toast(STR.erschoepft);
        this.exhaustedToastTimer = 8;
      }
    }

    // Der Hai interessiert sich nur für Spieler im Wasser
    const playerInWater =
      this.player.state === PlayerState.SwimSurface || this.player.state === PlayerState.Dive;
    this.world.update(dt, this.player.position, playerInWater);
    this.heldItem.update(dt);

    this.interaction.update(this.camera);
    // Wer auf der Leiter hängt, ohne zu klettern, bekommt die
    // Blicksteuerung erklärt – sobald es losgeht, ist der Hinweis weg.
    const hanging = this.player.state === PlayerState.Climb && !this.player.climbMoving;
    UI.setPrompt(hanging ? STR.climbHint : this.interaction.promptText());

    // Reparatur-Panel zeigen, solange der Motor anvisiert ist
    const lookingAtMotor = this.interaction.current?.object === this.world.motor.group;
    UI.setVisible(UI.motorPanel, lookingAtMotor);
    if (lookingAtMotor) this.motorRepair.renderPanel();

    if (this.debugVisible) this.updateDebug(dt);
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
