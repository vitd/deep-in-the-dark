import { saveSettings, settings } from '../systems/Settings';
import { UI } from './UIManager';

// Optionen-Panel (Lautstärke, Maus-Empfindlichkeit) – wird sowohl vom
// Hauptmenü als auch vom Pausemenü aus geöffnet.

const volume = document.getElementById('opt-volume') as HTMLInputElement;
const sensitivity = document.getElementById('opt-sensitivity') as HTMLInputElement;
const backBtn = document.getElementById('btn-options-back') as HTMLButtonElement;

let onClose: (() => void) | null = null;

volume.addEventListener('input', () => {
  settings.volume = parseFloat(volume.value);
  saveSettings();
});

sensitivity.addEventListener('input', () => {
  settings.sensitivity = parseFloat(sensitivity.value);
  saveSettings();
});

backBtn.addEventListener('click', () => closeOptions());

export function openOptions(closeCallback: () => void): void {
  onClose = closeCallback;
  volume.value = String(settings.volume);
  sensitivity.value = String(settings.sensitivity);
  UI.show(UI.options);
}

export function closeOptions(): void {
  UI.hide(UI.options);
  const cb = onClose;
  onClose = null;
  cb?.();
}
