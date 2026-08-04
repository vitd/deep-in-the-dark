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
| Leertaste | Auftauchen (beim Tauchen) / Springen (an Deck) / Leiter loslassen |
| E | Interagieren (Aufheben, Fangen) |
| Tab oder I | Inventar |
| 1–6 | Schnellinventar benutzen (Fisch essen) / auswählen |
| Scrollrad | Schnellinventar-Slot wechseln |
| Esc | Pause |

**Leitern** braucht man nicht anzuwählen: Wer nah genug davorsteht und
zur Leiter blickt, greift sie automatisch. Von oben (Deck- bzw.
Dachkante) genügt der Blick nach unten. Geklettert wird dann allein mit
der Maus – Blick nach oben steigt auf, Blick nach unten ab, waagerechter
Blick hält an; je steiler der Blick, desto schneller. Oben und unten
steigt man automatisch aus, zwischendurch löst die Leertaste.

## Überleben

- **Nahrung (0–100):** Bewegung (Schwimmen, Tauchen, Gehen, Klettern)
  kostet 1 Punkt pro 10 Sekunden. Fische fangen (E), ins Schnellinventar
  legen und mit Taste 1–6 essen (+35, großer Fisch +70; wird über
  3 Sekunden animiert angerechnet). Bei 0 bist du erschöpft und langsam.
- **Schnellinventar:** 6 Slots am unteren Bildschirmrand. Im Inventar
  (Tab) verschiebt ein Klick Items dorthin und zurück; die Tasten 1–6
  benutzen den jeweiligen Slot. Das ausgewählte Item hält der Spieler
  sichtbar in der Hand.
- **Leben (0–100):** Der Hai zieht pro Biss 30 Leben ab (roter
  Verletzungs-Blitz). Bei 0 stirbst du.
- **Der Hai:** Es gibt genau einen. Er patrouilliert im Meer und greift
  an, sobald du ihm im Wasser zu nahe kommst. Mit dem **Hammer in der
  Hand** wehrst du ihn ab: Linksklick (bzw. E ohne Ziel) schlägt zu —
  trifft der Schlag, flieht der Hai für längere Zeit. An Bord bist du
  sicher.
- **Luft (0–100):** Tauchen verbraucht 3 Punkte pro Sekunde; an der
  Oberfläche regeneriert die Luft in 8 Sekunden vollständig. Ohne Luft
  wird der Blick dunkel und die Nahrung schwindet schnell.
- Beide Werte werden im HUD links unten angezeigt.

## Crafting

In der Kajüte steht ein Tisch — die **Werkbank** (E: Benutzen). Sie
öffnet ein 3×3-Feld: Items per Klick aus dem Inventar hineinlegen,
passt die Kombination, erscheint rechts das Ergebnis; ein Klick darauf
stellt es her. Die Anordnung im Feld ist egal, nur die Mengen zählen.

Rezepte:

| Zutaten | Ergebnis |
|---|---|
| 3× Eisen + 2× Holzplanke | Hammer |

**Fässer zerlegen:** Ein Klick auf ein Fass legt es in den rechten
Slot; die Ausbeute erscheint links im Feld — immer 4 Planken + 4 Eisen,
dazu genau eine zufällige Ressourcen-Sorte (Nyzerin/Glyzerin/Gold bis 3,
Stein bis 5, Nahrung bis 6, Plastik bis 11). Nahrung ist essbar (+25).

**Treibstoff:** Seltene Treibstofffässer (rote Fässer, weit draußen)
enthalten 0–76 Liter — beim Aufsammeln wandert der Inhalt in den
Treibstoff-Vorrat (im Inventar sichtbar), das leere Fass bleibt als
Item. Für die Motor-Reparatur werden gebraucht: 50 Eisen, 50 Gold,
20 Nyzerin, 20 Glyzerin und 100 Liter Treibstoff.

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
