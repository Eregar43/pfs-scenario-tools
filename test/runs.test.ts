import { describe, expect, it } from 'vitest';
import { countUnmappedGlyphs, fontEncodingAgreement, resolveRunText } from '../src/pdf/runs.ts';
import type { Glyph, TextRun } from '../src/pdf/types.ts';

const PUA = 0xe000;

/** Baut einen Lauf; `spec` ist je Zeichen [gemeldeter Unicode, Zeichencode]. */
function run(font: string, spec: Array<[string, number]>): TextRun {
  const glyphs: Glyph[] = spec.map(([unicode, code]) => ({
    unicode,
    fontChar: PUA + code,
    isSpace: unicode === ' ',
  }));
  return { page: 1, x: 0, y: 0, width: 10, size: 9, font, glyphs, text: '' };
}

/** Standardkodiert: gemeldeter Unicode und Zeichencode stimmen ueberein. */
function standardRun(font: string, text: string): TextRun {
  return run(
    font,
    [...text].map((char) => [char, char.charCodeAt(0)] as [string, number]),
  );
}

describe('fontEncodingAgreement', () => {
  it('erkennt einen standardkodierten Font', () => {
    const rates = fontEncodingAgreement([standardRun('SabonLTStd-Roman', 'Breachill')]);
    expect(rates.get('SabonLTStd-Roman')).toBe(1);
  });

  it('erkennt einen Subset-Font mit eigener Kodierung', () => {
    // Die Codes 1..5 haben nichts mit den Buchstaben zu tun.
    const runs = [run('Ironstrike-Black', [['H', 1], ['e', 2], ['l', 3], ['l', 4], ['o', 5]])];
    expect(fontEncodingAgreement(runs).get('Ironstrike-Black')).toBe(0);
  });
});

describe('resolveRunText', () => {
  it('stellt Satzpunkte wieder her, die als Leerzeichen gemeldet werden', () => {
    // Paizos ToUnicode-Tabelle bildet den Punkt auf das Leerzeichen ab.
    const broken = run('SabonLTStd-Roman', [
      ['e', 0x65],
      ['n', 0x6e],
      ['d', 0x64],
      [' ', 0x2e],
    ]);
    const agreement = fontEncodingAgreement([standardRun('SabonLTStd-Roman', 'Breachill'), broken]);

    expect(resolveRunText(broken, agreement)).toBe('end.');
  });

  it('laesst echte Leerzeichen unangetastet', () => {
    const spaced = run('SabonLTStd-Roman', [['a', 0x61], [' ', 0x20], ['b', 0x62]]);
    const agreement = fontEncodingAgreement([spaced]);

    expect(resolveRunText(spaced, agreement)).toBe('a b');
  });

  it('repariert nichts bei frei kodierten Fonts', () => {
    // Code 0x2e steht hier fuer irgendein Zeichen, nicht fuer einen Punkt.
    const arbitrary = run('Ironstrike-Black', [['A', 1], ['B', 2], [' ', 0x2e]]);
    const agreement = fontEncodingAgreement([arbitrary]);

    expect(resolveRunText(arbitrary, agreement)).toBe('AB ');
  });
});

describe('countUnmappedGlyphs', () => {
  it('meldet Glyphen ohne Zeichen', () => {
    // So verschwindet ein "fi": die Ligatur hat keine Rueckabbildung.
    const broken = run('GoodOT', [['f', 0x66], ['', 0x1f], ['n', 0x6e], ['d', 0x64]]);

    expect(countUnmappedGlyphs([broken])).toBe(1);
    expect(countUnmappedGlyphs([standardRun('GoodOT', 'find')])).toBe(0);
  });
});
