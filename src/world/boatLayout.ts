// Deklaratives Layout des Boots. Alle Räume, Türen und Sperr-Zustände
// werden hier als Daten beschrieben – Umbauten am Boot passieren zuerst
// in dieser Datei, nicht in der Geometrie.
//
// Lokales Koordinatensystem des Boots (Ursprung = Bootsmitte auf
// Wasserlinie): x = Backbord(-)/Steuerbord(+), z = Bug(-)/Heck(+).
// Rumpf: x -4..4, z -12..12, Deck oben bei y = 1.5.

export type WallSide = 'port' | 'starboard' | 'fore' | 'aft';

export interface RoomDef {
  id: string;
  name: string;
  locked: boolean;
  // Innenraum als Quader [minX, minY, minZ] .. [maxX, maxY, maxZ]
  min: [number, number, number];
  max: [number, number, number];
  door: { wall: WallSide; offset?: number };
  props?: string[];
}

export const DECK_Y = 1.5; // Oberkante Rumpf = begehbares Deck
export const ROOF_Y = 4.15; // Oberkante Dachplatte = begehbares Oberdeck
const CEIL_Y = 4.0; // Deckenhöhe der Hauptdeck-Räume
const UPPER_CEIL_Y = 6.45;

// Der Aufbau ist schlanker als früher (x ±2.55) und sitzt weiter achtern,
// damit auf dem verjüngten Fischerboot-Rumpf rundherum ein begehbarer
// Gang bleibt und das Vordeck frei ist.
export const BOAT_LAYOUT: RoomDef[] = [
  // ----- Hauptdeck (Aufbau x -2.55..2.55) -----
  {
    id: 'kajuete',
    name: 'Kajüte',
    locked: false,
    min: [-2.55, DECK_Y, -9.8],
    max: [2.55, CEIL_Y, -5.8],
    door: { wall: 'starboard' },
    props: ['bunk', 'locker'],
  },
  {
    id: 'kombuese',
    name: 'Kombüse',
    locked: false,
    min: [-2.55, DECK_Y, -5.8],
    max: [2.55, CEIL_Y, -1.8],
    door: { wall: 'starboard' },
    props: ['counter', 'stove'],
  },
  {
    id: 'waffenkammer',
    name: 'Waffenkammer',
    locked: true,
    min: [-2.55, DECK_Y, -1.8],
    max: [2.55, CEIL_Y, 1.2],
    door: { wall: 'port' },
  },
  {
    id: 'lagerraum',
    name: 'Lagerraum',
    locked: true,
    min: [-2.55, DECK_Y, 1.2],
    max: [2.55, CEIL_Y, 4.2],
    door: { wall: 'port' },
  },
  {
    id: 'motorraum',
    name: 'Motorraum',
    locked: false,
    min: [-2.55, DECK_Y, 4.2],
    max: [2.55, CEIL_Y, 9.2],
    door: { wall: 'aft' },
    props: ['engine', 'telephone', 'workbench'],
  },

  // ----- Oberdeck (auf der Dachplatte) -----
  {
    id: 'bruecke',
    name: 'Brücke',
    locked: true,
    min: [-2.55, ROOF_Y, -9.8],
    max: [2.55, UPPER_CEIL_Y, -5.8],
    door: { wall: 'aft', offset: -1.5 },
  },
  {
    id: 'kartenraum',
    name: 'Kartenraum',
    locked: true,
    min: [-0.35, ROOF_Y, -5.8],
    max: [2.55, UPPER_CEIL_Y, -3.3],
    door: { wall: 'aft' },
  },
];
