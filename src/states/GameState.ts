// Gemeinsames Interface aller Spielzustände (Intro, Menü, Spiel, Pause).

export interface GameState {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(): void;
}
