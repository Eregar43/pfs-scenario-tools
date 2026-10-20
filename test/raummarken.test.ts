import { describe, expect, it } from 'vitest';
import { raummarkenAufKarte, seiteZuBild, type KartenLage } from '../src/pdf/raummarken.ts';
import type { Block, TextRun } from '../src/pdf/types.ts';
import { markePfad, markeSvg, notizenAusMarken, seiteZurKennung } from '../src/world/raummarken.ts';

/** Eine Kartenbeschriftung an einer Stelle der Seite, Grundlinie bei `y`. */
function beschriftung(page: number, x: number, y: number, text: string, breite = 10): Block {
  const lauf = { page, x, y, width: breite, size: 6, font: 'X', glyphs: [], text } as TextRun;
  return { role: 'map-label', page, column: 0, text, lines: [{ page, column: 0, x, y, runs: [lauf] }] };
}

/** Ein Bild von 200 × 100 Punkten, aufrecht bei (100, 300) bis (300, 400). */
const AUFRECHT: KartenLage = { page: 4, matrix: [200, 0, 0, 100, 100, 300], width: 400, height: 200 };

describe('seiteZuBild', () => {
  it('rechnet einen Seitenpunkt in Bildpunkte um, oben links als Ursprung', () => {
    expect(seiteZuBild(AUFRECHT, { x: 100, y: 400 })).toEqual({ x: 0, y: 0 });
    expect(seiteZuBild(AUFRECHT, { x: 200, y: 350 })).toEqual({ x: 200, y: 100 });
  });

  it('versteht eine um 90 Grad gedrehte Karte', () => {
    // So liegen die Querformatkarten im Heft: [0 -h w 0 e f].
    const gedreht: KartenLage = { page: 4, matrix: [0, -200, 100, 0, 50, 400], width: 400, height: 200 };
    // Die erste Bildzeile (oben) liegt rechts auf der Seite.
    const oben = seiteZuBild(gedreht, { x: 150, y: 400 });
    expect(oben).toEqual({ x: 0, y: 0 });
    const unten = seiteZuBild(gedreht, { x: 50, y: 200 });
    expect(unten).toEqual({ x: 400, y: 200 });
  });

  it('meldet einen Punkt neben dem Bild als nicht vorhanden', () => {
    expect(seiteZuBild(AUFRECHT, { x: 50, y: 350 })).toBeUndefined();
  });
});

describe('raummarkenAufKarte', () => {
  it('nimmt nur Raumkennungen, die auf dem Bild stehen', () => {
    const marken = raummarkenAufKarte(AUFRECHT, [
      beschriftung(4, 195, 348, 'C2'),
      beschriftung(4, 150, 320, 'C3a'),
      beschriftung(4, 120, 310, '1 SQUARE = 5 FEET', 60),
      beschriftung(4, 20, 20, 'C9'),
      beschriftung(5, 195, 348, 'C4'),
    ]);
    expect(marken.map((marke) => marke.kennung)).toEqual(['C2', 'C3a']);
    // Mitte der Schrift: halbe Laufbreite, ein Drittel des Grads ueber der Grundlinie.
    expect(marken[0]).toEqual({ kennung: 'C2', x: 200, y: 100 });
  });
});

describe('markeSvg', () => {
  it('zeichnet die Kennung schwarz auf Weiss', () => {
    const svg = markeSvg('C3a');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('>C3a</text>');
  });
});

describe('markePfad', () => {
  it('legt das Markerbild neben die Karte in marker/', () => {
    expect(markePfad('bilder/pfs_s09_02/die-hoehle.webp', 'C2')).toBe('bilder/pfs_s09_02/marker/C2.svg');
  });
});

describe('seiteZurKennung', () => {
  const seiten = [
    { id: 's1', name: 'C. Die Hoehle' },
    { id: 's2', name: 'C1. Eingang' },
    { id: 's3', name: 'C12. Tiefer Schacht' },
    { id: 's4', name: 'C3a. Nische' },
  ];

  it('findet die Seite, deren Name mit Kennung und Punkt beginnt', () => {
    expect(seiteZurKennung('C1', seiten)?.id).toBe('s2');
    expect(seiteZurKennung('C12', seiten)?.id).toBe('s3');
    expect(seiteZurKennung('C3a', seiten)?.id).toBe('s4');
  });

  it('verwechselt C1 nicht mit C12 und kennt keine fehlende Seite', () => {
    expect(seiteZurKennung('C1', [seiten[2]!])).toBeUndefined();
  });
});

describe('notizenAusMarken', () => {
  const seiten = [{ id: 's2', name: 'C1. Eingang' }];

  it('setzt die Notiz um Skalierung und Versatz verschoben an die Kennung', () => {
    const [notiz] = notizenAusMarken(
      [{ kennung: 'C1', x: 100, y: 50, pfad: 'b/marker/C1.svg' }],
      seiten,
      { skalierung: 2, szene: { grid: { size: 80 }, shiftX: 20, shiftY: 10 } },
      { width: 800, height: 400 },
    );
    expect(notiz).toEqual({
      x: 180,
      y: 90,
      texture: { src: 'b/marker/C1.svg' },
      iconSize: 80,
      text: 'C1. Eingang',
      journal: 'journal',
      pageId: 's2',
    });
  });

  it('rechnet einen Rand so ein, wie Foundry ihn auf ganze Felder rundet', () => {
    const [notiz] = notizenAusMarken(
      [{ kennung: 'C1', x: 0, y: 0, pfad: 'p' }],
      seiten,
      { szene: { grid: { size: 100 }, padding: 0.25 } },
      { width: 1000, height: 500 },
    );
    // 0,25 × 1000 = 250 → drei Felder; 0,25 × 500 = 125 → zwei Felder.
    expect(notiz).toMatchObject({ x: 300, y: 200 });
  });

  it('behaelt eine Kennung ohne Journalseite als blosse Beschriftung', () => {
    const [notiz] = notizenAusMarken([{ kennung: 'C9', x: 0, y: 0, pfad: 'p' }], seiten, undefined, {
      width: 10,
      height: 10,
    });
    expect(notiz).toEqual({ x: 0, y: 0, texture: { src: 'p' }, iconSize: 100, text: 'C9' });
  });
});
