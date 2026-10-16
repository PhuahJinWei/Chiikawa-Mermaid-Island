import './styles.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

// iOS Safari still pinch-zooms the page unless gesture events are cancelled.
document.addEventListener('gesturestart', (e) => e.preventDefault());

const game = new Game(canvas, ui);
void game.start();

// Comparison tools for matching film frames; stripped from production builds.
if (import.meta.env.DEV) {
  void import('./dev/DevTools').then(({ installDevTools }) => installDevTools(game.devApi()));
  (window as unknown as { __game: Game }).__game = game;
}
