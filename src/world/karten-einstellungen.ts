/**
 * Handvermessene Szenen-Einstellungen je Karte.
 *
 * Das aufgedruckte Raster einer Paizo-Karte verraet seine Kaestchengroesse in
 * Bildpunkten nicht — sie haengt von der Aufloesung ab, mit der die Karte im
 * PDF liegt, und das Raster beginnt selten genau an der Bildkante. Deshalb
 * misst der Autor die Werte am Tisch aus (Gitterwerkzeug in Foundry) und traegt
 * sie hier ein; der Import setzt sie dann bei jedem Lauf.
 *
 * Schluessel ist `<szenario>/<datei>` — gepaddet und ohne Endung, also so,
 * wie Kennung und Dateiname ohnehin gebildet werden.
 *
 * Fuer alle Szenen dieses Moduls gilt unabhaengig davon: Gitter-Deckung 0
 * (das Raster ist auf der Karte aufgedruckt, Foundrys Linien darueber waeren
 * doppelt) und schwarzer Hintergrund (der Rand um die Karte soll nicht
 * leuchten). Das steht in `apply.ts`, nicht hier — es ist keine Messung.
 */

export interface KartenEinstellung {
  /** Kaestchengroesse in Bildpunkten (`grid.size`). */
  gitter: number;
  /** Versatz des Hintergrunds (`background.offsetX/offsetY`). */
  versatzX: number;
  versatzY: number;
  /**
   * Faktor zwischen Bild- und Szenengroesse; fehlt er, gilt 1.
   *
   * Niedrig aufgeloeste Karten bekommen die doppelte Leinwand (Scene Scale 2
   * im Einstellungsfenster der Szene) — Gitter und Versatz sind dann auf der
   * vergroesserten Leinwand gemessen.
   */
  skalierung?: number;
}

export const KARTEN_EINSTELLUNGEN: Record<string, KartenEinstellung> = {
  '08-01/the-laboratory': { gitter: 87, versatzX: 19, versatzY: 22, skalierung: 2 },
  '08-01/the-laboratory-2': { gitter: 87, versatzX: 19, versatzY: 22, skalierung: 2 },
  '08-02/delusions-of-grandeur': { gitter: 43, versatzX: -25, versatzY: -27 },
  '08-03/the-solstice-theater': { gitter: 87, versatzX: -43, versatzY: 28, skalierung: 2 },
  '08-04/the-sinister-stevedores': { gitter: 87, versatzX: -69, versatzY: 23, skalierung: 2 },
  '08-04/the-gallivanting-ghoul': { gitter: 67, versatzX: 19, versatzY: 17, skalierung: 2 },
};

/** Die Einstellung einer Karte, falls sie schon vermessen ist. */
export function kartenEinstellung(
  schluessel: string,
  datei: string,
): KartenEinstellung | undefined {
  return KARTEN_EINSTELLUNGEN[`${schluessel}/${datei}`];
}
