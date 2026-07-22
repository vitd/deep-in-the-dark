// Audio-Stub für Milestone 1: verwaltet nur die Master-Lautstärke,
// damit der Optionen-Regler etwas Reales steuert. Sounds folgen später.

import { settings } from './Settings';

class AudioManagerImpl {
  get volume(): number {
    return settings.volume;
  }

  play(_name: string): void {
    // Absichtlich leer – Sound-Assets existieren noch nicht.
  }
}

export const Audio = new AudioManagerImpl();
