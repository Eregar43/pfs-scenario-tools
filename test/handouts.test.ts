import { describe, expect, it } from 'vitest';
import { sammleHandouts } from '../src/pdf/handouts.ts';
import type { Block } from '../src/pdf/types.ts';

// Erfundener Wortlaut, nur der Satzbauform nachgebildet.
function block(role: Block['role'], page: number, text: string, column = 0): Block {
  return { role, page, column, text, lines: [] };
}

const VERZEICHNIS = [
  block('subheading', 2, 'Adventure . . . . . . . 3'),
  block('subheading', 2, 'Appendix: Statistics . . . . 9'),
  block('subheading', 2, 'Appendix: Game Aids . . . . 11'),
  block('subheading', 2, 'Organized Play . . . . 12'),
];

const HANDOUT_SEITE = [
  block('body', 11, 'Dear friends,\n\nMeet me at the old mill before dawn. Bring the lantern.\n\n—Nobody in Particular'),
  block('heading', 11, 'Appendix: Game Aids', 1),
  block('box-heading', 11, 'HANDOUT 1: THE MILLER’S NOTE', 1),
];

describe('sammleHandouts', () => {
  it('findet das Handout ueber seine Kastenzeile und nimmt den Wortlaut der Seite mit', () => {
    const [handout, ...weitere] = sammleHandouts([
      ...VERZEICHNIS,
      block('body', 4, 'Give the players **Handout 1: The Miller’s Note** on page 11.'),
      ...HANDOUT_SEITE,
    ]);

    expect(weitere).toEqual([]);
    expect(handout).toMatchObject({ titel: 'Handout 1: The Miller’s Note', seite: 11 });
    expect(handout?.html).toContain('<h1 class="no-toc">Handout 1: The Miller’s Note</h1>');
    expect(handout?.html).toContain('<div class="handout">');
    expect(handout?.html).toContain('<p>Dear friends,</p>');
    expect(handout?.html).toContain('<p>—Nobody in Particular</p>');
    // Die Kopfzeile des Appendix ist kein Wortlaut.
    expect(handout?.html).not.toContain('Appendix');
  });

  it('haelt eine Kastenzeile im Abenteuerteil fuer kein Handout', () => {
    expect(
      sammleHandouts([...VERZEICHNIS, block('box-heading', 5, 'HANDOUT: NOT A REAL ONE')]),
    ).toEqual([]);
  });

  it('kommt ohne Inhaltsverzeichnis aus', () => {
    expect(sammleHandouts(HANDOUT_SEITE).map((h) => h.titel)).toEqual([
      'Handout 1: The Miller’s Note',
    ]);
  });

  it('nennt mehrere Handouts in Seitenreihenfolge', () => {
    const handouts = sammleHandouts([
      ...VERZEICHNIS,
      block('body', 13, 'Second note.'),
      block('box-heading', 13, 'HANDOUT 2: THE REPLY', 1),
      ...HANDOUT_SEITE,
    ]);
    expect(handouts.map((h) => h.titel)).toEqual([
      'Handout 1: The Miller’s Note',
      'Handout 2: The Reply',
    ]);
  });

  it('bleibt leer, wenn das Heft keines hat', () => {
    expect(sammleHandouts(VERZEICHNIS)).toEqual([]);
  });
});
