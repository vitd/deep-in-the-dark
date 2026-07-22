# Deep in the Dark

Browserbasiertes First-Person-Survival-Spiel mit Retro-Pixel-Look.
Gestrandet auf einem Boot vor unendlich hohen Klippen: Bring den Motor
wieder in Gang – oder lade das Funkgerät auf und rufe Hilfe.

## Starten (Entwicklung)

```bash
npm install
npm run dev
```

Dann im Browser öffnen: http://localhost:5173

## Steuerung

| Taste | Aktion |
|---|---|
| Maus | Umsehen |
| W A S D | Bewegen / Schwimmen |
| C oder steil nach unten blicken + W | Abtauchen |
| Leertaste | Auftauchen (beim Tauchen) / Springen (an Deck) |
| E | Interagieren (Aufheben, Fangen, Klettern) |
| Tab oder I | Inventar |
| Esc | Pause |

An der Leiter: W/S = hoch/runter klettern.

## Überleben

- **Nahrung (0–100):** Anstrengung (Schwimmen, Tauchen, Gehen) zehrt.
  Fische fangen (E) und im Inventar anklicken zum Essen. Bei 0 bist du
  erschöpft und langsam.
- **Luft (0–100):** Tauchen verbraucht Luft, an der Oberfläche füllt sie
  sich in wenigen Sekunden wieder. Ohne Luft wird der Blick dunkel und
  die Nahrung schwindet schnell.
- Beide Werte werden im HUD links unten angezeigt.

## Intro-Video

Eine Datei `public/assets/intro.mp4` wird beim Start abgespielt
(überspringbar mit Esc/Leertaste/Klick). Fehlt sie, geht es direkt
ins Hauptmenü.

## Debug-Modus

http://localhost:5173/?debug zeigt FPS, Spielerzustand und
Kollisionsboxen; Taste T teleportiert aufs Bootsdeck.

## Technik

- [Three.js](https://threejs.org) (MIT) + [Vite](https://vite.dev) (MIT) + TypeScript
- Keine Physik-Engine: eigener kinematischer Character-Controller
  (Schwimmen, Tauchen, Leiterklettern, Gehen) mit AABB-Kollision
- Pixel-Look: Rendering in ein 480×270-RenderTarget, Nearest-Neighbor-
  Upscaling, Posterisierung + Bayer-Dithering (`src/config.ts`)
- Das Boot entsteht prozedural aus dem deklarativen Layout in
  `src/world/boatLayout.ts`
- Alle Stellschrauben: `src/config.ts` · Alle Texte: `src/ui/strings.de.ts`

## Build

```bash
npm run build     # Typprüfung + Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen
```

Für den späteren nativen Download ist Tauri vorgesehen (verpackt den
unveränderten Web-Build); alle Pfade sind bereits relativ (`base: './'`).
