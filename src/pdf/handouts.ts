/**
 * Die Handouts des Hefts — Briefe und Notizen, die der Spielleiter den
 * Spielern in die Hand gibt.
 *
 * Sie stehen im Appendix „Game Aids", jedes auf einer eigenen Heftseite: der
 * Wortlaut in einer Handschrift (`roles.ts`, Rolle `body`) und dazu die
 * Kastenzeile `HANDOUT: …` oder `HANDOUT 1: …`. Im Blockstrom liegt die
 * Zeile **hinter** dem Wortlaut, weil die Spaltensuche sie einer anderen
 * Spalte zuordnet. Deshalb wird nicht nach Reihenfolge gepaart, sondern je
 * Heftseite: Eine Seite mit Handout-Zeile ist ein Handout, und ihr ganzer
 * Fliesstext ist sein Wortlaut.
 *
 * Gemessen an der Season 8: zwei Handouts (8-01 und 8-04), je eines auf
 * seiner Seite. Zwei Handouts auf einer Seite kaemen so nicht auseinander —
 * dann gilt die erste Zeile als Titel, und der Text bleibt beisammen, statt
 * geraten getrennt zu werden.
 *
 * Das Abenteuer selbst bleibt aussen vor (`detectSections`): Dort nennt das
 * Heft ein Handout nur im Fliesstext, nie als Kastenzeile — aber wer den
 * Bereich kennt, muss sich darauf nicht verlassen.
 */
import { detectSections, escapeHtml, paragraphs } from './journal.ts';
import { titleCase } from './text.ts';
import type { Block } from './types.ts';

export interface Handout {
  /** Titel in gemischter Schreibung, `Handout 1: A Letter From …`. */
  titel: string;
  /** Heftseite, auf der es steht. */
  seite: number;
  /** Fertiges HTML: Ueberschrift und der Wortlaut in einem `.handout`. */
  html: string;
}

const HANDOUT_TITLE = /^HANDOUT\b/i;

export function sammleHandouts(blocks: Block[]): Handout[] {
  const [abenteuer] = detectSections(blocks);
  const imAbenteuer = (seite: number): boolean =>
    abenteuer !== undefined &&
    Number.isFinite(abenteuer.to) &&
    seite >= abenteuer.from &&
    seite <= abenteuer.to;

  const titelJeSeite = new Map<number, string>();
  for (const block of blocks) {
    if (block.role !== 'box-heading' || imAbenteuer(block.page)) continue;
    const zeile = block.text.replace(/\s+/g, ' ').trim();
    if (!HANDOUT_TITLE.test(zeile) || titelJeSeite.has(block.page)) continue;
    titelJeSeite.set(block.page, titleCase(zeile));
  }

  return [...titelJeSeite.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seite, titel]) => {
      const wortlaut = blocks
        .filter((block) => block.page === seite && block.role === 'body')
        .map((block) => block.text)
        .join('\n\n');
      return {
        titel,
        seite,
        html: [
          `<h1 class="no-toc">${escapeHtml(titel)}</h1>`,
          '<div class="handout">',
          ...paragraphs(wortlaut),
          '</div>',
        ].join('\n'),
      };
    });
}
