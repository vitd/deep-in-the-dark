// Vollbild-Schalter rechts oben. Liegt über allen Menüs und dem HUD;
// am Rechner verschwindet er, solange die Maus im Spiel gefangen ist
// (dann gibt es ohnehin keinen Zeiger, mit dem man ihn treffen könnte),
// und auf Geräten ohne Fullscreen-API (iPhone) gar nicht.

type FsDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = document as FsDoc;

function fullscreenElement(): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function toggleFullscreen(): void {
  if (fullscreenElement()) {
    if (doc.exitFullscreen) void doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
    return;
  }
  const root = doc.documentElement as FsEl;
  if (root.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
  else root.webkitRequestFullscreen?.();
}

export function setupFullscreenButton(): void {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  if (!doc.fullscreenEnabled && !doc.webkitFullscreenEnabled) {
    btn.remove();
    return;
  }

  const update = () => {
    const full = fullscreenElement() !== null;
    btn.textContent = full ? '⤡' : '⛶';
    btn.title = full ? 'Vollbild verlassen' : 'Vollbild';
    btn.classList.toggle('hidden', document.pointerLockElement !== null);
  };

  btn.addEventListener('click', () => {
    toggleFullscreen();
    // Fokus abgeben, sonst löst die Leertaste den Knopf statt des Spiels aus
    btn.blur();
  });
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  document.addEventListener('pointerlockchange', update);
  update();
}
