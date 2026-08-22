/**
 * Macht aus den Schadensangaben des Fliesstextes wuerfelbare Verweise.
 *
 * Im Heft steht `takes 4d10 piercing damage`, im Journal soll
 * `@Damage[4d10[piercing]] damage` stehen — anklickbar statt abgetippt. So
 * setzen es auch die mitgelieferten Gefahren des Systems
 * (`@Damage[3d12[electricity]]`).
 *
 * Gesucht wird nur das feste Muster **Wuerfel, Schadensart, `damage`**. Das
 * Wort `damage` bleibt stehen, wie bei den Proben der Nachsatz stehen bleibt.
 */

/**
 * Die Schadensarten des Systems — abgelesen an `scripts/config/damage.ts`
 * und `traits.ts` der Fassung 8.4.0.
 *
 * Die Liste ist bewusst geschlossen. `precision` steht **nicht** darin,
 * obwohl das Heft `1d4 precision damage` druckt: Im System ist Praezision
 * eine Schadens**kategorie**, keine Art. `@Damage[1d4[precision]]` waere
 * falsch, und Foundry wuerde es nicht als Fehler zeigen, sondern als leeren
 * Wurf. Was hier fehlt, bleibt deshalb Text.
 */
const SCHADENSARTEN = new Set([
  // energyDamageTypes
  'acid',
  'cold',
  'electricity',
  'fire',
  'force',
  'sonic',
  'vitality',
  'void',
  // physicalDamageTypes
  'bleed',
  'bludgeoning',
  'piercing',
  'slashing',
  // die vier einzeln gefuehrten
  'mental',
  'poison',
  'spirit',
  'untyped',
]);

/**
 * `4d10 piercing damage`, `2d8+7 bludgeoning damage`, `10 bludgeoning damage`.
 *
 * Auch die blosse Zahl zaehlt — Sturzschaden wird nicht gewuerfelt (`falls 20
 * feet to the floor below, taking 10 bludgeoning damage`). Zwei solche Stellen
 * stehen in der Season 8; sie zuerst wegzulassen war ein Fehlschluss aus einer
 * Messung, die nur nach Wuerfeln gesucht hatte.
 *
 * Der Wuerfelausdruck steht in der Alternative **vorn**: Sonst risse `2d8+7`
 * bei der `7` auseinander.
 *
 * Ohne die Schadensart und das Wort `damage` greift nichts. Beide zusammen
 * machen das Muster eng genug, dass keine Aufzaehlung hineinrutscht.
 */
const SCHADEN = /\b(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+([a-z]+)\s+damage\b/g;

/**
 * Setzt die Schadenswuerfe eines Textes.
 *
 * Eine unbekannte Schadensart laesst den Text unberuehrt, statt einen Wurf zu
 * bauen, den das System nicht deuten kann.
 */
export function enrichDamage(text: string): string {
  return text.replace(SCHADEN, (match, formel: string, art: string) => {
    if (!SCHADENSARTEN.has(art)) return match;
    return `@Damage[${formel.replace(/\s+/g, '')}[${art}]] damage`;
  });
}
