import waende0801Labor from '../../daten/waende/08-01/the-laboratory.json';
import waende0801Labor2 from '../../daten/waende/08-01/the-laboratory-2.json';
import waende0802Delusions from '../../daten/waende/08-02/delusions-of-grandeur.json';
import waende0803Solstice from '../../daten/waende/08-03/the-solstice-theater.json';
import waende0804Stevedores from '../../daten/waende/08-04/the-sinister-stevedores.json';
import waende0804Ghoul from '../../daten/waende/08-04/the-gallivanting-ghoul.json';
import waende0805NansWatch from '../../daten/waende/08-05/nans-watch.json';
import waende0805GunpowderKeg from '../../daten/waende/08-05/the-gunpowder-keg.json';

/**
 * Handgezeichnete Waende je Karte, das Gegenstueck zu den
 * `KARTEN_EINSTELLUNGEN`: Der Autor zeichnet die Waende in Foundry, sie werden
 * aus der Welt exportiert (`tools/exportiere-waende.mjs`) und hier als
 * JSON eingebunden. Der Import setzt sie dann bei jedem Lauf.
 *
 * Die Koordinaten gelten auf der **fertigen** Leinwand — also nach
 * `skalierung` und mit dem Versatz aus den Karten-Einstellungen. Aendert
 * sich je die Skalierung einer Karte, muessen ihre Waende neu gezeichnet
 * werden.
 */

/** Eine Wand, wie sie exportiert wurde; `c` ist `[x1, y1, x2, y2]`. */
export interface Wand {
  c: number[];
  [feld: string]: unknown;
}

const WAENDE: Record<string, Wand[]> = {
  '08-01/the-laboratory': waende0801Labor,
  '08-01/the-laboratory-2': waende0801Labor2,
  '08-02/delusions-of-grandeur': waende0802Delusions,
  '08-03/the-solstice-theater': waende0803Solstice,
  '08-04/the-sinister-stevedores': waende0804Stevedores,
  '08-04/the-gallivanting-ghoul': waende0804Ghoul,
  '08-05/nans-watch': waende0805NansWatch,
  '08-05/the-gunpowder-keg': waende0805GunpowderKeg,
};

/** Die Waende einer Karte, falls sie schon gezeichnet sind. */
export function kartenWaende(schluessel: string, datei: string): Wand[] | undefined {
  return WAENDE[`${schluessel}/${datei}`];
}

/**
 * Kennzeichen einer Wandmenge zum Vergleich: nur die Felder, die der Export
 * schreibt. Schwellen (`threshold`) und Animation bleiben aussen vor — sie
 * stehen im Export ohnehin auf den Standardwerten.
 */
export function wandSignaturen(waende: readonly Record<string, unknown>[]): string {
  const einzeln = waende.map((wand) =>
    ['c', 'move', 'sight', 'sound', 'light', 'dir', 'door', 'ds']
      .map((feld) => `${feld}=${JSON.stringify(wand[feld] ?? null)}`)
      .join('|'),
  );
  return einzeln.sort().join('\n');
}
