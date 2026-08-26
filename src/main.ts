import './styles/ui.css';
import { Game } from './Game';
import { Audio } from './systems/AudioManager';

Audio.preload();
new Game().start();
