import './styles/ui.css';
import { Game } from './Game';
import { PlayState } from './states/PlayState';
import { Audio } from './systems/AudioManager';
import { setupFullscreenButton } from './ui/Fullscreen';

Audio.preload();
setupFullscreenButton();

const game = new Game();

// Entwicklungs-Fotowerkzeug: ?photo=... springt direkt ins Spiel und setzt
// feste Kameraposen für reproduzierbare Aufnahmen (src/dev/photo.ts).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('photo')) {
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1) || 1;
  const play = new PlayState(game);
  // globalThis-Handle, das das Screenshot-Werkzeug (tools/capture.mjs) anspricht
  import('./dev/photo').then(({ installiereFotoWerkzeug }) => {
    (globalThis as unknown as Record<string, unknown>).__ditd = installiereFotoWerkzeug(play, seed);
  });
  game.startWith(play);
} else {
  game.start();
}
