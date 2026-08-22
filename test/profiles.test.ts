import { describe, expect, it } from 'vitest';
import { classifyFont, normaliseFontName } from '../src/pdf/roles.ts';
import { compareFonts, findConstants, renderReport } from '../src/pdf/profiles.ts';
import { PROFILE_VERSION, type ScenarioProfile } from '../src/pdf/profile.ts';

function profile(name: string, fonts: Array<[string, string, boolean]>): ScenarioProfile {
  return {
    version: PROFILE_VERSION,
    szenario: name,
    quelle: `${name}.pdf`,
    erstellt: '2026-08-03',
    seiten: 33,
    seitenmass: { breite: 603, hoehe: 783 },
    spalten: { '2': 30, '1': 3 },
    schriften: fonts.map(([font, rolle, erkannt]) => ({
      name: font,
      rolle: rolle as never,
      zweck: 'Test',
      erkannt,
      glyphen: 100,
      groessen: [9],
      kodierung: 0.99,
    })),
    zeichen: { gesamt: 100, ohneZuordnung: 0, reparierteSatzzeichen: 10, ligaturen: 5 },
    bloecke: { body: 10 },
    warnungen: [],
  };
}

describe('normaliseFontName', () => {
  it('entfernt das Praefix eingebetteter Teilschriften', () => {
    expect(normaliseFontName('YALYRB+TimesNewRomanPS-BoldMT')).toBe('TimesNewRomanPS-BoldMT');
    expect(normaliseFontName('SabonLTStd-Roman')).toBe('SabonLTStd-Roman');
  });
});

describe('classifyFont', () => {
  it('erkennt eine Schrift auch mit Teilschrift-Praefix', () => {
    expect(classifyFont('YALYRB+TimesNewRomanPS-BoldMT', 9)).toMatchObject({
      rolle: 'body',
      erkannt: true,
    });
  });

  it('trennt Bildunterschrift von Ueberschrift ueber den Schriftgrad', () => {
    // Season 1 nutzt dieselbe Hausschrift fuer beides, nur in zwei Graden.
    expect(classifyFont('Taroca', 12).rolle).toBe('caption');
    expect(classifyFont('Taroca', 16).rolle).toBe('heading');
  });

  it('erkennt den schwarzen Schnitt unabhaengig vom Grad als Bildunterschrift', () => {
    // Den Kolumnentitel findet stattdessen headers.ts ueber die Wiederholung.
    expect(classifyFont('Ironstrike-Black', 12).rolle).toBe('caption');
    expect(classifyFont('Ironstrike-ExtraBold', 15).rolle).toBe('heading');
  });

  it('meldet eine unbekannte Schrift, behandelt sie aber als Fliesstext', () => {
    expect(classifyFont('IrgendwasNeues-Regular', 9)).toMatchObject({
      rolle: 'body',
      erkannt: false,
    });
  });
});

describe('compareFonts', () => {
  it('zaehlt, in wie vielen Szenarien eine Schrift vorkommt', () => {
    const fonts = compareFonts([
      profile('A', [['GoodOT', 'box', true], ['Nur-In-A', 'body', false]]),
      profile('B', [['GoodOT', 'box', true]]),
    ]);

    expect(fonts[0]).toMatchObject({ name: 'GoodOT', szenarien: ['A', 'B'] });
    expect(fonts.find((font) => font.name === 'Nur-In-A')?.szenarien).toEqual(['A']);
  });

  it('faellt auf, wenn dieselbe Schrift die Rolle wechselt', () => {
    const fonts = compareFonts([
      profile('A', [['GoodOT', 'box', true]]),
      profile('B', [['GoodOT', 'body', true]]),
    ]);

    expect(fonts[0]!.rollen).toEqual(new Set(['box', 'body']));
  });
});

describe('findConstants', () => {
  it('nennt nur, was in allen Profilen gleich ist', () => {
    const constants = findConstants([
      profile('A', [['GoodOT', 'box', true]]),
      profile('B', [['GoodOT', 'box', true]]),
    ]);

    expect(constants).toContain('Seitenmass 603 x 783 pt');
    expect(constants).toContain('vorherrschend 2-spaltig');
  });

  it('schweigt zum Seitenmass, sobald es abweicht', () => {
    const abweichend = profile('B', [['GoodOT', 'box', true]]);
    abweichend.seitenmass = { breite: 612, hoehe: 792 };

    const constants = findConstants([profile('A', [['GoodOT', 'box', true]]), abweichend]);

    expect(constants.some((c) => c.startsWith('Seitenmass'))).toBe(false);
  });
});

describe('renderReport', () => {
  it('weist eine Schrift ohne Regel aus', () => {
    const report = renderReport([profile('A', [['Neu-Regular', 'body', false]])]);

    expect(report).toContain('keine Regel');
  });

  it('warnt davor, aus einem Profil eine Regel zu machen', () => {
    expect(renderReport([profile('A', [['GoodOT', 'box', true]])])).toContain(
      'noch keine Regel',
    );
  });
});

describe('classifyFont — Grad trennt gleiche Schrift', () => {
  it('trennt Merkmalsplakette von Kastentitel', () => {
    // Beides GoodOT-CondBold: CONCENTRATE steht auf 7 pt, GUIDING CIVILIANS auf 12 pt.
    expect(classifyFont('GoodOT-CondBold', 7).rolle).toBe('traits');
    expect(classifyFont('GoodOT-CondBold', 12).rolle).toBe('box-heading');
  });
});
