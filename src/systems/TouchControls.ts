import { MouseLook } from '../player/MouseLook';

// Mobile Steuerung im üblichen FPS-Layout:
// - links: virtueller Joystick -> WASD
// - rechts: Wisch-Fläche -> Blickrichtung (ersetzt die Maus)
// - Buttons: E (Aktion), Springen/Auftauchen, Inventar, Pause
//
// Der Joystick schreibt direkt in das Tasten-Set des Spielzustands
// (KeyW/KeyA/KeyS/KeyD, Space) – die Spielerlogik bleibt unverändert.

export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
}

export interface TouchHooks {
  onInteract: () => void;
  onToggleInventory: () => void;
  onPause: () => void;
}

const JOY_RADIUS = 40; // maximale Knopf-Auslenkung in px
const DEADZONE = 0.32;
const LOOK_SPEED = 2.4; // Touch-Wischen relativ zur Maus

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class TouchControls {
  private readonly joystick = el('joystick');
  private readonly knob = el('joystick-knob');
  private readonly lookArea = el('look-area');
  private readonly btnAction = el('btn-touch-action');
  private readonly btnJump = el('btn-touch-jump');
  private readonly btnInv = el('btn-touch-inv');
  private readonly btnPause = el('btn-touch-pause');

  private joyTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  constructor(
    private readonly keys: Set<string>,
    private readonly look: MouseLook,
    private readonly hooks: TouchHooks,
  ) {}

  // ---- Joystick ----

  private readonly onJoyStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.joyTouchId !== null) return;
    const t = e.changedTouches[0];
    this.joyTouchId = t.identifier;
    this.updateJoy(t);
  };

  private readonly onJoyMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyTouchId) this.updateJoy(t);
    }
  };

  private readonly onJoyEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyTouchId) this.resetJoy();
    }
  };

  private updateJoy(t: Touch): void {
    const rect = this.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (t.clientX - cx) / JOY_RADIUS;
    let dy = (t.clientY - cy) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${dx * JOY_RADIUS}px, ${dy * JOY_RADIUS}px)`;

    // Auslenkung in digitale WASD-Richtungen übersetzen
    this.setKey('KeyW', dy < -DEADZONE);
    this.setKey('KeyS', dy > DEADZONE);
    this.setKey('KeyA', dx < -DEADZONE);
    this.setKey('KeyD', dx > DEADZONE);
  }

  private resetJoy(): void {
    this.joyTouchId = null;
    this.knob.style.transform = '';
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.keys.delete(k);
  }

  private setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  // ---- Blick-Fläche ----

  private readonly onLookStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.lookTouchId !== null) return;
    const t = e.changedTouches[0];
    this.lookTouchId = t.identifier;
    this.lookLastX = t.clientX;
    this.lookLastY = t.clientY;
  };

  private readonly onLookMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.lookTouchId) continue;
      this.look.applyDelta(
        (t.clientX - this.lookLastX) * LOOK_SPEED,
        (t.clientY - this.lookLastY) * LOOK_SPEED,
      );
      this.lookLastX = t.clientX;
      this.lookLastY = t.clientY;
    }
  };

  private readonly onLookEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.lookTouchId) this.lookTouchId = null;
    }
  };

  // ---- Buttons ----

  private readonly onAction = (e: TouchEvent) => {
    e.preventDefault();
    this.hooks.onInteract();
  };

  private readonly onJumpDown = (e: TouchEvent) => {
    e.preventDefault();
    this.keys.add('Space');
  };

  private readonly onJumpUp = () => {
    this.keys.delete('Space');
  };

  private readonly onInv = (e: TouchEvent) => {
    e.preventDefault();
    this.hooks.onToggleInventory();
  };

  private readonly onPause = (e: TouchEvent) => {
    e.preventDefault();
    this.hooks.onPause();
  };

  // ---- Lebenszyklus ----

  attach(): void {
    document.body.classList.add('touch-mode');
    this.joystick.addEventListener('touchstart', this.onJoyStart, { passive: false });
    this.joystick.addEventListener('touchmove', this.onJoyMove, { passive: false });
    this.joystick.addEventListener('touchend', this.onJoyEnd);
    this.joystick.addEventListener('touchcancel', this.onJoyEnd);
    this.lookArea.addEventListener('touchstart', this.onLookStart, { passive: false });
    this.lookArea.addEventListener('touchmove', this.onLookMove, { passive: false });
    this.lookArea.addEventListener('touchend', this.onLookEnd);
    this.lookArea.addEventListener('touchcancel', this.onLookEnd);
    this.btnAction.addEventListener('touchstart', this.onAction, { passive: false });
    this.btnJump.addEventListener('touchstart', this.onJumpDown, { passive: false });
    this.btnJump.addEventListener('touchend', this.onJumpUp);
    this.btnJump.addEventListener('touchcancel', this.onJumpUp);
    this.btnInv.addEventListener('touchstart', this.onInv, { passive: false });
    this.btnPause.addEventListener('touchstart', this.onPause, { passive: false });
  }

  detach(): void {
    document.body.classList.remove('touch-mode');
    this.resetJoy();
    this.lookTouchId = null;
    this.keys.delete('Space');
    this.joystick.removeEventListener('touchstart', this.onJoyStart);
    this.joystick.removeEventListener('touchmove', this.onJoyMove);
    this.joystick.removeEventListener('touchend', this.onJoyEnd);
    this.joystick.removeEventListener('touchcancel', this.onJoyEnd);
    this.lookArea.removeEventListener('touchstart', this.onLookStart);
    this.lookArea.removeEventListener('touchmove', this.onLookMove);
    this.lookArea.removeEventListener('touchend', this.onLookEnd);
    this.lookArea.removeEventListener('touchcancel', this.onLookEnd);
    this.btnAction.removeEventListener('touchstart', this.onAction);
    this.btnJump.removeEventListener('touchstart', this.onJumpDown);
    this.btnJump.removeEventListener('touchend', this.onJumpUp);
    this.btnJump.removeEventListener('touchcancel', this.onJumpUp);
    this.btnInv.removeEventListener('touchstart', this.onInv);
    this.btnPause.removeEventListener('touchstart', this.onPause);
  }
}
