/**
 * Handgezeichnete Waende einer Karte. Sie stehen in der Kartendatei
 * (`daten/karten/`, siehe `karten.ts`) und werden in Foundry gezeichnet und
 * ueber das Fenster „Karte exportieren" herausgeholt.
 *
 * Die Koordinaten gelten auf der **fertigen** Leinwand — also nach
 * `skalierung` und mit dem Versatz der Szene. Aendert sich je die Skalierung
 * einer Karte, muessen ihre Waende neu gezeichnet werden.
 */

/** Eine Wand, wie sie exportiert wurde; `c` ist `[x1, y1, x2, y2]`. */
export interface Wand {
  c: number[];
  [feld: string]: unknown;
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
