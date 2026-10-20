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
  /** Bildmatrix: bildet das Einheitsquadrat des Bildes auf die Seite ab. */
  matrix: readonly number[];
  width: number;
  height: number;
}

/** Dieselbe Form wie `RAUMNUMMER` in `statblock.ts`. */
const KENNUNG = /^[A-Z]\d+[a-z]?$/;

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
      if (!KENNUNG.test(text)) continue;
      const punkt = mitte(zeile);
      const imBild = punkt && seiteZuBild(lage, punkt);
      if (!imBild) continue;
      marken.push({ kennung: text, x: Math.round(imBild.x), y: Math.round(imBild.y) });
    }
  }
  return marken;
}
