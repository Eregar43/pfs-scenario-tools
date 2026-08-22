import { describe, expect, it } from 'vitest';
import { dropRunningHeads, findRunningHeads, titleFromHeads } from '../src/pdf/headers.ts';
import type { TextRun } from '../src/pdf/types.ts';

const PAGE_HEIGHT = 783;

function run(page: number, y: number, text: string, font = 'Ironstrike-Black'): TextRun {
  return { page, x: 24, y, width: text.length * 5, size: 22, font, glyphs: [], text };
}

describe('findRunningHeads', () => {
  it('erkennt den Kolumnentitel an der Wiederholung im oberen Rand', () => {
    const runs = [3, 4, 5, 6].map((page) => run(page, 728, 'Enough is Enough'));

    const heads = findRunningHeads(runs, PAGE_HEIGHT);

    expect(heads.size).toBe(1);
    expect([...heads.values()][0]).toMatchObject({ text: 'Enough is Enough', pages: 4, atTop: true });
  });

  it('erkennt auch den Kolumnenfuss', () => {
    const runs = [3, 4, 5].map((page) => run(page, 36, 'Pathfinder Society Scenario'));

    expect([...findRunningHeads(runs, PAGE_HEIGHT).values()][0]).toMatchObject({ atTop: false });
  });

  it('haelt eine ueber mehrere Seiten laufende Ueberschrift nicht dafuer', () => {
    // Gleicher Text auf drei Seiten, aber mitten im Satzspiegel.
    const runs = [3, 4, 5].map((page) => run(page, 675, 'Appendix: Game Aids'));

    expect(findRunningHeads(runs, PAGE_HEIGHT).size).toBe(0);
  });

  it('braucht mehr als zwei Seiten', () => {
    const runs = [3, 4].map((page) => run(page, 728, 'Nur zweimal'));

    expect(findRunningHeads(runs, PAGE_HEIGHT).size).toBe(0);
  });
});

describe('dropRunningHeads', () => {
  it('entfernt genau die wiederkehrenden Rand-Laeufe', () => {
    const runs = [
      ...[3, 4, 5].map((page) => run(page, 728, 'Enough is Enough')),
      run(3, 400, 'Fliesstext mitten auf der Seite', 'SabonLTStd-Roman'),
    ];

    const kept = dropRunningHeads(runs, findRunningHeads(runs, PAGE_HEIGHT));

    expect(kept).toHaveLength(1);
    expect(kept[0]!.text).toBe('Fliesstext mitten auf der Seite');
  });
});

describe('titleFromHeads', () => {
  it('setzt einen zweizeiligen Kolumnentitel von oben nach unten zusammen', () => {
    const runs = [
      ...[3, 4, 5].map((page) => run(page, 752, "Intro to the Year of Battle's Spark:")),
      ...[3, 4, 5].map((page) => run(page, 728, 'Enough is Enough')),
    ];

    const title = titleFromHeads(runs, findRunningHeads(runs, PAGE_HEIGHT), 'egal');

    expect(title).toBe("Intro to the Year of Battle's Spark: Enough is Enough");
  });

  it('faellt zurueck, wenn es keinen Kolumnentitel gibt', () => {
    expect(titleFromHeads([], new Map(), 'Dateiname')).toBe('Dateiname');
  });

  it('nimmt den Kolumnenfuss nicht fuer den Titel', () => {
    const runs = [3, 4, 5].map((page) => run(page, 36, 'Pathfinder Society Scenario'));

    expect(titleFromHeads(runs, findRunningHeads(runs, PAGE_HEIGHT), 'Dateiname')).toBe('Dateiname');
  });
});
