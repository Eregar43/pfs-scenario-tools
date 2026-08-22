import type { TextRun } from './types.ts';

/**
 * Erkennt Kolumnentitel und Kolumnenfuss.
 *
 * Der naheliegende Weg waere der Schriftgrad — gross gesetzt, also Titel. Er
 * traegt aber nicht: Season 1 setzt den Kolumnentitel in derselben Schrift wie
 * Zwischenueberschriften (`GoodOT-Bold`), waehrend Season 1 gleichzeitig
 * Begegnungsueberschriften auf 21 pt hat. Nach Grad gefiltert verschwaende man
 * das eine und behielte das andere.
 *
 * Verlaesslich ist stattdessen die Wiederholung: derselbe Text, dieselbe
 * Grundlinie, auf vielen Seiten, im Rand ausserhalb des Satzspiegels.
 */

/** Ab so vielen Seiten gilt eine Wiederholung als Kolumnentitel. */
const MIN_PAGES = 3;

/** Hoehe des Randstreifens oben und unten, in Punkten. */
const TOP_MARGIN = 75;
const BOTTOM_MARGIN = 55;

function inMargin(y: number, pageHeight: number): boolean {
  return y >= pageHeight - TOP_MARGIN || y <= BOTTOM_MARGIN;
}

function keyOf(run: TextRun): string {
  return `${run.font}|${Math.round(run.y)}|${run.text.trim()}`;
}

export interface RunningHead {
  text: string;
  /** Auf wie vielen Seiten der Lauf unveraendert wiederkehrt. */
  pages: number;
  /** Wahr, wenn er oben steht — dort steht der Szenarientitel. */
  atTop: boolean;
}

/**
 * Sammelt die wiederkehrenden Rand-Laeufe eines Dokuments.
 *
 * `pageHeight` ist die Hoehe der Seite; die Grundlinie zaehlt von unten.
 */
export function findRunningHeads(
  runs: TextRun[],
  pageHeight: number,
): Map<string, RunningHead> {
  const seen = new Map<string, { pages: Set<number>; run: TextRun }>();

  for (const run of runs) {
    const text = run.text.trim();
    if (text.length < 4 || !inMargin(run.y, pageHeight)) continue;
    const key = keyOf(run);
    const entry = seen.get(key);
    if (entry) entry.pages.add(run.page);
    else seen.set(key, { pages: new Set([run.page]), run });
  }

  const heads = new Map<string, RunningHead>();
  for (const [key, { pages, run }] of seen) {
    if (pages.size < MIN_PAGES) continue;
    heads.set(key, {
      text: run.text.trim(),
      pages: pages.size,
      atTop: run.y >= pageHeight - TOP_MARGIN,
    });
  }
  return heads;
}

/** Entfernt die erkannten Kolumnentitel und -fuesse aus dem Lauftext. */
export function dropRunningHeads(runs: TextRun[], heads: Map<string, RunningHead>): TextRun[] {
  return runs.filter((run) => !heads.has(keyOf(run)));
}

/**
 * Der Szenarientitel steht im Kolumnentitel — er ist der Rand-Lauf oben, der am
 * haeufigsten wiederkehrt. Laeuft der Titel ueber zwei Zeilen, werden sie von
 * oben nach unten zusammengesetzt.
 */
export function titleFromHeads(
  runs: TextRun[],
  heads: Map<string, RunningHead>,
  fallback: string,
): string {
  const top = [...heads.entries()].filter(([, head]) => head.atTop);
  if (top.length === 0) return fallback;

  const mostPages = Math.max(...top.map(([, head]) => head.pages));
  const lines = top
    .filter(([, head]) => head.pages === mostPages)
    .map(([key, head]) => ({ y: Number(key.split('|')[1]), text: head.text }))
    // Weiter oben zuerst: die Grundlinie zaehlt von unten.
    .sort((a, b) => b.y - a.y);

  const title = lines
    .map((line) => line.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')
    .trim();

  void runs;
  return title === '' ? fallback : title;
}
