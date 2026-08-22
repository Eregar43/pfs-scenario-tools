/**
 * Kleine Textwerkzeuge, die mehrere Leser brauchen.
 *
 * Sie standen frueher in `journal.ts`. Ausgezogen sind sie, damit
 * `statblock.ts` sie benutzen kann, ohne den Journalbau zu importieren —
 * `journal.ts` liest seinerseits Statbloecke, und das gaebe einen Ringschluss.
 */

/**
 * Versalien werden zu gemischter Schreibung. Paizo setzt Kastentitel in
 * Grossbuchstaben, das Journal schreibt sie normal — `GUIDING CIVILIANS` wird
 * zu `Guiding Civilians`.
 */
export function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s(])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}
