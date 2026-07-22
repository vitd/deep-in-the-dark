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

export const BOAT_LAYOUT: RoomDef[] = [
  // ----- Hauptdeck (Aufbau x -2.8..2.8) -----
  {
    id: 'kajuete',
    name: 'Kajüte',
    locked: false,
    min: [-2.8, DECK_Y, -11],
    max: [2.8, CEIL_Y, -7],
    door: { wall: 'starboard' },
    props: ['bunk', 'locker'],
  },
  {
    id: 'kombuese',
    name: 'Kombüse',
    locked: false,
    min: [-2.8, DECK_Y, -7],
    max: [2.8, CEIL_Y, -3],
    door: { wall: 'starboard' },
    props: ['counter', 'stove'],
  },
  {
    id: 'waffenkammer',
    name: 'Waffenkammer',
    locked: true,
    min: [-2.8, DECK_Y, -3],
    max: [2.8, CEIL_Y, 0],
    door: { wall: 'port' },
  },
  {
    id: 'lagerraum',
    name: 'Lagerraum',
    locked: true,
    min: [-2.8, DECK_Y, 0],
    max: [2.8, CEIL_Y, 3],
    door: { wall: 'port' },
  },
  {
    id: 'motorraum',
    name: 'Motorraum',
    locked: false,
    min: [-2.8, DECK_Y, 3],
    max: [2.8, CEIL_Y, 8],
    door: { wall: 'aft' },
    props: ['engine', 'radio', 'workbench'],
  },

  // ----- Oberdeck (auf der Dachplatte) -----
  {
    id: 'bruecke',
    name: 'Brücke',
    locked: true,
    min: [-2.8, ROOF_Y, -11],
    max: [2.8, UPPER_CEIL_Y, -7],
    door: { wall: 'aft', offset: -1.7 },
  },
  {
    id: 'kartenraum',
    name: 'Kartenraum',
    locked: true,
    min: [-0.35, ROOF_Y, -7],
    max: [2.8, UPPER_CEIL_Y, -4.5],
    door: { wall: 'aft' },
  },
];
