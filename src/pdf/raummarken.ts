import type { Kartenlinie } from './kartenlinien.ts';
import type { Block, Line } from './types.ts';

/**
 * Die Raumkennungen einer Karte (`A1`, `B12`, `A3a`) und wo sie stehen.
 *
 * Das Heft druckt sie als Text **auf** die Karte; der Blockstrom fuehrt sie
 * als Rolle `map-label`. Mit der Bildmatrix der Karte laesst sich jede
 * Beschriftung in einen Bildpunkt umrechnen — daraus entstehen die Marker
 * auf der Szene (`world/raummarken.ts`).
 *
 * Reine Logik, kein Foundry- und kein Node-Bezug.
 */

/** Eine Raumkennung an ihrer Stelle im Kartenbild. */
export interface Raummarke {
  kennung: string;
  /** Bildpunkte von links. */
  x: number;
  /** Bildpunkte von oben. */
  y: number;
}

/** Was von einem Kartenbild gebraucht wird. */
export interface KartenLage {
  page: number;
  /** Name des Bildobjekts — nur Linien, die danach gezeichnet sind, liegen obenauf. */
  name?: string;
  /** Bildmatrix: bildet das Einheitsquadrat des Bildes auf die Seite ab. */
  matrix: readonly number[];
  width: number;
  height: number;
}

/**
 * Eine Raumkennung: Buchstabe, Ziffern, wahlweise ein Buchstabe. Der letzte
 * kommt auf der Karte auch gross vor (`A3A` in 8-08) und wird klein
 * geschrieben, wie im Text (`A3a`).
 */
const KENNUNG = /^([A-Z]\d+)([a-z]?)$/i;

/** `a3A` → `A3a`; keine Kennung → nichts. */
export function alsKennung(text: string): string | undefined {
  const treffer = KENNUNG.exec(text);
  return treffer ? `${treffer[1]!.toUpperCase()}${treffer[2]!.toLowerCase()}` : undefined;
}

/**
 * Wo die Mitte der Schrift liegt: halbe Breite, und ueber der Grundlinie
 * etwa ein Drittel des Schriftgrads (halbe Versalhoehe).
 */
function mitte(zeile: Line): { x: number; y: number } | undefined {
  if (zeile.runs.length === 0) return undefined;
  const links = Math.min(...zeile.runs.map((lauf) => lauf.x));
  const rechts = Math.max(...zeile.runs.map((lauf) => lauf.x + lauf.width));
  const grad = Math.max(...zeile.runs.map((lauf) => lauf.size));
  return { x: (links + rechts) / 2, y: zeile.y + grad / 3 };
}

/**
 * Seitenpunkt → Bildpunkt, ueber die Umkehrung der Bildmatrix.
 *
 * pdf.js zeichnet ein Bild ins Einheitsquadrat; die Matrix `[a b c d e f]`
 * setzt es auf die Seite. Die Umkehrung fuehrt zurueck ins Quadrat, und das
 * Bild steht dort **kopfueber** (die erste Bildzeile liegt bei v = 1).
 * Drehung und Spiegelung rechnen so ohne Sonderfall mit.
 */
export function seiteZuBild(
  lage: KartenLage,
  punkt: { x: number; y: number },
): { x: number; y: number } | undefined {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = lage.matrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return undefined;
  const px = punkt.x - e;
  const py = punkt.y - f;
  const u = (d * px - c * py) / det;
  const v = (-b * px + a * py) / det;
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;
  return { x: u * lage.width, y: (1 - v) * lage.height };
}

/**
 * Die Raumkennungen, die auf diesem Kartenbild stehen.
 *
 * Gelesen wird zeilenweise, nicht blockweise: Liegen zwei Kennungen dicht
 * beieinander, kann die Blockbildung sie zu einem Block zusammenfassen.
 * Was ausserhalb des Bildes steht — Massstab, Kartentitel, eine
 * Nachbarkarte —, faellt beim Umrechnen heraus.
 */
export function raummarkenAufKarte(lage: KartenLage, blocks: readonly Block[]): Raummarke[] {
  const marken: Raummarke[] = [];
  for (const block of blocks) {
    if (block.page !== lage.page || block.role !== 'map-label') continue;
    for (const zeile of block.lines) {
      const text = zeile.runs
        .map((lauf) => lauf.text)
        .join('')
        .replace(/\*/g, '')
        .trim();
      const kennung = alsKennung(text);
      if (!kennung) continue;
      const punkt = mitte(zeile);
      const imBild = punkt && seiteZuBild(lage, punkt);
      if (!imBild) continue;
      marken.push({ kennung, x: Math.round(imBild.x), y: Math.round(imBild.y) });
    }
  }
  return marken;
}

/** Eine weitere Beschriftung auf der Karte (`TRAP`, Startfelder). */
export interface Kartentext {
  text: string;
  /** Mitte, in Bildpunkten. */
  x: number;
  y: number;
  /** Schriftgrad in Bildpunkten. */
  groesse: number;
}

/** Eine Linie ueber der Karte, in Bildpunkten. */
export interface Kartenstrich {
  punkte: Array<{ x: number; y: number }>;
  geschlossen: boolean;
  farbe: string;
  /** Strichstaerke in Bildpunkten. */
  breite: number;
  gestrichelt: boolean;
}

/**
 * Was auf jeder Karte steht und dem Spielleiter nichts sagt: Massstab,
 * Produktname der Spielmatte, Kartentitel (`A. The Abandoned Mine`).
 */
const RANDTEXT = /SQUARE\s*=|FLIP-MAT|FLIP-TILES|MAP PACK/i;

/** Bildpunkte je Seitenpunkt — das Mittel beider Achsen der Bildmatrix. */
function bildpunkteJePunkt(lage: KartenLage): number {
  const [a = 0, b = 0, c = 0, d = 0] = lage.matrix;
  const flaeche = Math.abs(a * d - b * c);
  return flaeche > 0 ? Math.sqrt((lage.width * lage.height) / flaeche) : 1;
}

/**
 * Die uebrigen Beschriftungen auf der Karte, je Block eine.
 *
 * Ein Block kann mehrere Zeilen haben (`PCS` / `START` / `HERE` stehen
 * untereinander); sie werden mit Leerzeichen zu einem Text. Raumkennungen
 * fehlen hier — die werden Notizen. Der Kartentitel steht in einer groesseren
 * Schrift als alle Beschriftungen und faellt am Schriftgrad heraus.
 */
export function kartentexteAufKarte(lage: KartenLage, blocks: readonly Block[]): Kartentext[] {
  const texte: Kartentext[] = [];
  const faktor = bildpunkteJePunkt(lage);
  for (const block of blocks) {
    if (block.page !== lage.page || block.role !== 'map-label') continue;
    // Zeilen, die selbst eine Raumkennung sind, stehen schon als Marker auf
    // der Karte (`A4` und `A6` als ein Block in 8-03).
    const uebrig = block.lines.filter(
      (zeile) =>
        zeile.runs.length > 0 &&
        !alsKennung(zeile.runs.map((lauf) => lauf.text).join('').replace(/\*/g, '').trim()),
    );
    for (const zeilen of nachNaehe(uebrig)) {
      const text = kartentext(lage, zeilen, faktor);
      if (text) texte.push(text);
    }
  }
  return texte;
}

/**
 * Teilt die Zeilen eines Blocks in Gruppen, die auf der Karte beieinander
 * stehen. `PCS` / `START` / `HERE` liegen Zeile an Zeile und bleiben ein
 * Text; die drei Gegnernamen der zweiten Karte in 8-04 stehen an drei Stellen
 * der Karte, landen aber im selben Block.
 */
function nachNaehe(zeilen: readonly Line[]): Line[][] {
  const gruppen: Line[][] = [];
  for (const zeile of zeilen) {
    const hier = mitte(zeile);
    const grad = Math.max(...zeile.runs.map((lauf) => lauf.size));
    const gruppe = gruppen.find((kandidaten) =>
      kandidaten.some((andere) => {
        const dort = mitte(andere);
        return hier && dort && Math.hypot(hier.x - dort.x, hier.y - dort.y) <= grad * 2;
      }),
    );
    if (gruppe) gruppe.push(zeile);
    else gruppen.push([zeile]);
  }
  return gruppen;
}

/** Eine Gruppe von Zeilen als ein Kartentext — oder nichts, wenn sie nicht zaehlt. */
function kartentext(lage: KartenLage, zeilen: readonly Line[], faktor: number): Kartentext | undefined {
  const text = zeilen
    .map((zeile) => zeile.runs.map((lauf) => lauf.text).join(''))
    .join(' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '' || RANDTEXT.test(text)) return undefined;
  const grad = Math.max(...zeilen.flatMap((zeile) => zeile.runs.map((lauf) => lauf.size)));
  if (grad > 14) return undefined;

  const mitten = zeilen
    .map(mitte)
    .filter((punkt): punkt is { x: number; y: number } => punkt !== undefined)
    .map((punkt) => seiteZuBild(lage, punkt));
  if (mitten.length === 0 || mitten.some((punkt) => punkt === undefined)) return undefined;
  const imBild = mitten as Array<{ x: number; y: number }>;
  return {
    text,
    x: Math.round(imBild.reduce((summe, punkt) => summe + punkt.x, 0) / imBild.length),
    y: Math.round(imBild.reduce((summe, punkt) => summe + punkt.y, 0) / imBild.length),
    groesse: Math.round(grad * faktor),
  };
}

/**
 * Dasselbe Bildobjekt, auch wenn pdf.js es anders nennt.
 *
 * Ein Bild, das pdf.js im Dokument schon einmal gesehen hat, wandert in den
 * gemeinsamen Speicher und heisst dann `g_d2_img_p8_1` statt `img_p8_1`. Der
 * Bilderlauf und der Linienlauf besuchen verschiedene Seiten und sehen
 * deshalb verschiedene Namen — in 8-04 fielen so alle Kaesten der zweiten
 * Karte heraus.
 */
function gleichesBild(a: string, b: string): boolean {
  const kern = (name: string): string => name.replace(/^g_d\d+_/, '');
  return kern(a) === kern(b);
}

/** Die Linien, die ganz auf dem Kartenbild liegen, umgerechnet in Bildpunkte. */
export function kartenstricheAufKarte(
  lage: KartenLage,
  linien: readonly Kartenlinie[],
): Kartenstrich[] {
  const faktor = bildpunkteJePunkt(lage);
  const striche: Kartenstrich[] = [];
  for (const linie of linien) {
    if (linie.page !== lage.page) continue;
    if (lage.name !== undefined && !linie.ueber.some((name) => gleichesBild(name, lage.name!))) {
      continue;
    }
    const punkte = linie.punkte.map((punkt) => seiteZuBild(lage, punkt));
    if (punkte.some((punkt) => punkt === undefined)) continue;
    striche.push({
      punkte: (punkte as Array<{ x: number; y: number }>).map((punkt) => ({
        x: Math.round(punkt.x),
        y: Math.round(punkt.y),
      })),
      geschlossen: linie.geschlossen,
      farbe: linie.farbe,
      breite: Math.max(1, Math.round(linie.breite * faktor)),
      gestrichelt: linie.gestrichelt,
    });
  }
  return striche;
}
