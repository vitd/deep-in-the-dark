// Zentral definierte Farbpalette (siehe docs/art-bible.md). Alle
// Materialien, Lichter, Nebel und Effekte ziehen ihre Farben hierher,
// damit die ganze Welt eine durchgängige, kühle Meeres-Linie behält.
//
// Regel: Außenwelt und Wasser bleiben kühl-blau-grau; Wärme kommt nur
// punktuell (Holz im Boot, Gold, Motorrot) und markiert etwas.

export const PALETTE = {
  // Atmosphäre
  himmelOben: 0x9fb8c8,
  himmelUnten: 0x0b3644,
  wasserTief: 0x14424f,
  wasserFlach: 0x3f8a96,
  nebelOben: 0x9fb8c8,
  nebelUnten: 0x0b3644,

  // Licht (siehe SONNE_RICHTUNG)
  sonne: 0xfff2d8,
  fuellung: 0xbfd0d8,
  umgebung: 0xbfd4dc,
  hemisphaereOben: 0xcfe0e8,
  hemisphaereUnten: 0x54483c,
  // Aufhellung unter Wasser, hält den kühlen Ton der Atmosphäre
  unterwasserLicht: 0x8fb6c4,

  // Gestein und Grund
  steinDunkel: 0x2c363d,
  steinHell: 0x66747d,
  geroll: 0x5a666d,
  bodenRelief: 0x4a5560,
  basisstein: 0x593f31, // Tempel-Basalt (warm-dunkel, hebt sich vom Grund ab)
  sand: 0xae9c74,
  gold: 0xd9b24a,

  // Boot
  rumpf: 0xffffff, // getönt über die Textur
  rumpfTon: 0xdfe6df,
  dach: 0xb0a890,
  reling: 0x7a5c40,
  metall: 0x4a545c,
  telefon: 0x3a4a40,
  motor: 0x7a2a20,
  motorglut: 0xff2a12,

  // Warn- und Sonderfarben
  gefahrRot: 0xc8452f,
  giftgruen: 0x7fff9a,
} as const;

// Eine einzige Sonnenrichtung für Weltlicht und Wasser-Shader.
export const SONNE_RICHTUNG = { x: 0.42, y: 0.64, z: 0.64 } as const;

// Intensitäten der Außenbeleuchtung an einer Stelle, damit sie in
// World.ts, in Werkstatt-Ansichten und späteren Effekten gleich sind.
export const LICHT = {
  umgebung: 0.5,
  hemisphaere: 0.7,
  sonne: 2.3,
  fuellung: 0.75,
  // Faktor unter Wasser (gedämpft, aber lesbar)
  unterwasserFaktor: 0.6,
} as const;
