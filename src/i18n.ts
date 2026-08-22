/** Namensraum aller Sprachschluessel dieses Moduls. */
export const I18N_NAMESPACE = 'PFSST';

/**
 * Kurzform fuer `game.i18n.format`, wie sie sich in `showstopping_tools`
 * bewaehrt hat: `L("Dialog.Titel")` statt des vollen Schluessels an jeder
 * Aufrufstelle.
 *
 * `format` statt `localize` auch ohne Daten — Foundry faellt dann von selbst
 * auf reines Nachschlagen zurueck, und der Aufruf muss nicht umgeschrieben
 * werden, sobald der erste Platzhalter dazukommt.
 */
export function L(key: string, data?: Record<string, unknown>): string {
  return game.i18n.format(`${I18N_NAMESPACE}.${key}`, data ?? {});
}
