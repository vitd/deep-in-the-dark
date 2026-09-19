import './styles/ui.css';
import { Game } from './Game';
import { Audio } from './systems/AudioManager';
import { setupFullscreenButton } from './ui/Fullscreen';

Audio.preload();
setupFullscreenButton();
new Game().start();
