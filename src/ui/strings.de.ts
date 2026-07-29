// Sämtliche deutschen UI-Texte an einem Ort.

export const STR = {
  pickUp: 'E: Aufheben',
  climbHint: 'Leiter: Blick hoch/runter · Leertaste: loslassen',
  catchFish: 'E: Fangen',
  gegessen: (name: string, plus: number) => `${name} gegessen (+${plus} Nahrung)`,
  erschoepft: 'Du bist erschöpft – iss etwas!',
  nahrung: 'Nahrung',
  luft: 'Luft',
  locked: 'Versperrt',
  engineBroken: 'Motor (defekt)',
  radioDead: 'Funkgerät (ohne Strom)',
  loadNotAvailable: 'Spiel laden ist noch nicht verfügbar.',
  quitBrowserHint: 'Zum Beenden bitte den Browser-Tab schließen.',
  inventoryFull: 'Inventar voll!',
  pickedUp: (name: string) => `${name} +1`,
  itemNames: {
    holzplanke: 'Holzplanke',
    eisen: 'Eisen',
    fisch: 'Fisch',
    grossfisch: 'Großer Fisch',
    gold: 'Gold',
    fass: 'Fass',
  } as Record<string, string>,
} as const;
