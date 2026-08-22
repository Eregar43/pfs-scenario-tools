/**
 * Die Farben der Season-Ordner.
 *
 * Woertlich uebernommen aus
 * `showstopping_tools/scripts/macros/build-pfs-adventures.js` — beide Module
 * faerben dieselben Ordner, und wenn die Tabellen auseinanderlaufen, faerben
 * sie sich gegenseitig um. Es gibt keinen sauberen Weg, das zu teilen; also
 * kopiert, mit einem Verweis auf beiden Seiten.
 */

/** Paizos eigene Hausfarben, so wie sie auf den Produkten erscheinen. */
const OFFICIAL_SEASON_COLORS: Readonly<Record<number, string>> = {
  4: '#6c2d78',
  5: '#003655',
  6: '#812f34',
  7: '#246865',
};

/** Ersatz fuer Jahrgaenge ohne bekannte Hausfarbe. */
const SEASON_COLOR_PALETTE = [
  '#c0392b',
  '#d68910',
  '#b7950b',
  '#229954',
  '#17a589',
  '#2e86c1',
  '#7d3c98',
  '#a04000',
];

/**
 * Die Hausfarbe eines Jahrgangs, falls es eine gibt.
 *
 * Sie ist **massgeblich**: sie wird auch auf einen schon vorhandenen Ordner
 * geschrieben. Palettenfarben dagegen nur beim Ersterzeugen — sonst
 * ueberschriebe ein Lauf die Farbe, die jemand von Hand gewaehlt hat.
 */
export function officialColorFor(season: number): string | undefined {
  return OFFICIAL_SEASON_COLORS[season];
}

export function defaultColorFor(season: number): string {
  return (
    officialColorFor(season) ??
    SEASON_COLOR_PALETTE[(season - 1) % SEASON_COLOR_PALETTE.length]!
  );
}

/**
 * Hebt eine Farbe auf eine Helligkeit, die auf dunklem Grund lesbar ist.
 *
 * Die Jahrgangsfarben sind fuer helles Papier gemischt — eine Ueberschrift
 * in `#003655` verschwindet auf dunklem Grund. Gerechnet wird in **HSL**,
 * nicht als Mischung gegen Weiss: Wer Blau gegen Creme mischt, bekommt
 * Graugruen und verliert den Jahrgang. Ueber HSL bleiben Farbton und
 * Charakter erhalten, es wandert nur die Helligkeit.
 *
 * Die Saettigung wird zugleich gedeckelt: eine hell **und** voll gesaettigte
 * Farbe leuchtet auf dunklem Grund wie eine Leuchtreklame.
 *
 * Absichtlich hier als reine Funktion und nicht als `color-mix` im
 * Stylesheet — so ist das Ergebnis pruefbar und haengt nicht an der
 * Browserfassung.
 */
export function aufgehellt(farbe: string, ziellicht = 0.7, hoechstSaettigung = 0.55): string {
  const rgb = alsRgb(farbe);
  if (!rgb) return farbe;

  const [h, s, l] = nachHsl(rgb);
  return alsHex(nachRgb([h, Math.min(s, hoechstSaettigung), Math.max(l, ziellicht)]));
}

/**
 * Das Gegenstueck: dunkel genug, dass helle Schrift darauf steht.
 *
 * Gebraucht fuer die Inhaltsleiste des Journals, die in der Jahrgangsfarbe
 * liegt. Die Palettenfarben fuer Jahrgaenge ohne Hausfarbe sind teils hell
 * (`#b7950b`, `#d68910`) — ohne Deckel saehe die Leiste bei Season 3 und 11
 * anders aus als bei allen anderen.
 */
export function abgedunkelt(farbe: string, hoechstlicht = 0.24): string {
  const rgb = alsRgb(farbe);
  if (!rgb) return farbe;

  const [h, s, l] = nachHsl(rgb);
  return alsHex(nachRgb([h, s, Math.min(l, hoechstlicht)]));
}

/** `#abc` und `#aabbcc` zu drei Werten von 0 bis 1; sonst `null`. */
function alsRgb(farbe: string): [number, number, number] | null {
  const roh = farbe.trim().replace(/^#/, '');
  const voll =
    roh.length === 3
      ? roh
          .split('')
          .map((zeichen) => zeichen + zeichen)
          .join('')
      : roh;
  if (!/^[0-9a-fA-F]{6}$/.test(voll)) return null;
  return [0, 2, 4].map((versatz) => Number.parseInt(voll.slice(versatz, versatz + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function alsHex([r, g, b]: [number, number, number]): string {
  const kanal = (wert: number): string =>
    Math.round(Math.min(1, Math.max(0, wert)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${kanal(r)}${kanal(g)}${kanal(b)}`;
}

function nachHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const hoch = Math.max(r, g, b);
  const tief = Math.min(r, g, b);
  const spanne = hoch - tief;
  const l = (hoch + tief) / 2;
  if (spanne === 0) return [0, 0, l];

  const s = spanne / (1 - Math.abs(2 * l - 1));
  const h =
    hoch === r
      ? ((g - b) / spanne + (g < b ? 6 : 0)) / 6
      : hoch === g
        ? ((b - r) / spanne + 2) / 6
        : ((r - g) / spanne + 4) / 6;
  return [h, s, l];
}

function nachRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  const sechstel = Math.floor(h * 6) % 6;
  const roh: [number, number, number] =
    sechstel === 0
      ? [c, x, 0]
      : sechstel === 1
        ? [x, c, 0]
        : sechstel === 2
          ? [0, c, x]
          : sechstel === 3
            ? [0, x, c]
            : sechstel === 4
              ? [x, 0, c]
              : [c, 0, x];
  return [roh[0] + m, roh[1] + m, roh[2] + m];
}

/**
 * Vergleicht zwei Farbangaben.
 *
 * `Folder#color` ist seit Foundry v13 ein `Color`-Objekt und keine
 * Zeichenkette; ein direkter Vergleich gegen `"#c0392b"` ist deshalb immer
 * falsch. Diese Funktion nimmt beides entgegen.
 */
export function gleicheFarbe(a: unknown, b: unknown): boolean {
  return normalisiereFarbe(a) === normalisiereFarbe(b);
}

export function normalisiereFarbe(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const text = typeof wert === 'string' ? wert : (wert as { toString?: () => string }).toString?.();
  if (!text || text === '[object Object]') return null;
  return text.toLowerCase();
}
