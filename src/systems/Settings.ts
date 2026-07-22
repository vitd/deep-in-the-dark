// Persistente Einstellungen (localStorage). Bewusst hinter einer kleinen
// Abstraktion, damit der spätere native Build auf Dateisystem wechseln kann.

const KEY = 'ditd-settings';

export const settings = {
  volume: 0.8,
  sensitivity: 1.0,
};

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<typeof settings>;
    if (typeof data.volume === 'number') settings.volume = data.volume;
    if (typeof data.sensitivity === 'number') settings.sensitivity = data.sensitivity;
  } catch {
    // defekte Daten ignorieren, Defaults behalten
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // z. B. Speicher voll – Einstellungen gelten dann nur für die Sitzung
  }
}
