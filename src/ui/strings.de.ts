// Sämtliche deutschen UI-Texte an einem Ort.

export const STR = {
  pickUp: 'E: Aufheben',
  climb: 'E: Klettern',
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
  } as Record<string, string>,
} as const;
