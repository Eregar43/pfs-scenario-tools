import { describe, expect, it } from 'vitest';
import {
  colourShare,
  imageRole,
  isBackdrop,
  traegtKartenbeschriftung,
  GRAYSCALE,
  RGB,
  RGBA,
  type Placement,
} from '../src/pdf/images.ts';
import type { Block, BlockRole } from '../src/pdf/types.ts';

/** Ein Block mit einer einzigen Zeile an dieser Stelle; nur die Geometrie zaehlt. */
function blockAt(role: BlockRole, x: number, y: number): Block {
  return {
    page: 1,
    column: 0,
    role,
    text: 'x',
    lines: [{ x, y, runs: [], size: 9, column: 0 }],
  } as unknown as Block;
}

/** Ein RGBA-Bild von 10x10 Punkten: links deckend, rechts durchsichtig. */
function halbDeckend(): { width: number; height: number; kind: number; data: Uint8Array } {
  const data = new Uint8Array(10 * 10 * 4);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) data[(y * 10 + x) * 4 + 3] = x < 5 ? 255 : 0;
  }
  return { width: 10, height: 10, kind: RGBA, data };
}

const LAGE: Placement = { left: 100, right: 200, bottom: 300, top: 400 };

// Die `encodeWebp`-Tests des Extractors fehlen hier absichtlich: die
// WebP-Kodierung laeuft im Browser ueber `OffscreenCanvas`, das es unter
// Vitest nicht gibt. Geprueft wird sie in der laufenden Instanz.

describe('imageRole', () => {
  it('trennt Karte und Figur am Alphakanal', () => {
    // Eine Karte ist ein volles Rechteck und braucht keine Durchsicht; ein
    // Figurenbild ist freigestellt und traegt seinen Umriss im Alphakanal.
    expect(imageRole(RGB)).toBe('karte');
    expect(imageRole(GRAYSCALE)).toBe('karte');
    expect(imageRole(RGBA)).toBe('figur');
  });
});

describe('isBackdrop', () => {
  it('erkennt Text auf deckender Farbe als Kastengrund', () => {
    expect(isBackdrop(halbDeckend(), LAGE, [blockAt('box', 120, 350)])).toBe(true);
  });

  it('laesst Text in der Luft neben einer Figur gelten', () => {
    // Rechte Haelfte ist durchsichtig — dort steht der Text neben der Figur.
    expect(isBackdrop(halbDeckend(), LAGE, [blockAt('body', 180, 350)])).toBe(false);
  });

  it('zaehlt eine Bildunterschrift auf dem Bild nicht als Kastengrund', () => {
    // 8-06: `Dagur Hawksight` steht unten auf dem Portraet, auf deckenden
    // Punkten. Ein Kastengrund traegt nie eine Bildunterschrift.
    expect(isBackdrop(halbDeckend(), LAGE, [blockAt('caption', 120, 310)])).toBe(false);
  });
});

describe('traegtKartenbeschriftung', () => {
  it('erkennt eine Karte an der Beschriftung auf deckenden Punkten', () => {
    expect(traegtKartenbeschriftung(halbDeckend(), LAGE, [blockAt('map-label', 120, 350)])).toBe(
      true,
    );
  });

  it('laesst eine Beschriftung ueber durchsichtigen Punkten nicht gelten', () => {
    // Das Rechteck einer freigestellten Figur kann eine Nachbarkarte
    // ueberlappen — deren Beschriftung liegt dann in der Luft der Figur.
    expect(traegtKartenbeschriftung(halbDeckend(), LAGE, [blockAt('map-label', 180, 350)])).toBe(
      false,
    );
  });

  it('laesst eine Beschriftung ausserhalb des Bildes nicht gelten', () => {
    expect(traegtKartenbeschriftung(halbDeckend(), LAGE, [blockAt('map-label', 50, 350)])).toBe(
      false,
    );
  });
});

describe('colourShare', () => {
  it('meldet eine einfarbige Flaeche als arm', () => {
    // Ein Verlauf oder eine Farbflaeche kennt kaum Toene — daran erkennt sich
    // der Seitenschmuck, der jede Groessenschwelle reisst.
    const flat = new Uint8Array(40 * 40 * 3).fill(200);
    expect(colourShare(40, 40, RGB, flat, 1)).toBeCloseTo(1 / 1600, 5);
  });

  it('meldet lauter verschiedene Punkte als reich', () => {
    const data = new Uint8Array(16 * 16 * 3);
    for (let i = 0; i < 16 * 16; i++) {
      data[i * 3] = i & 0xff;
      data[i * 3 + 1] = (i * 7) & 0xff;
      data[i * 3 + 2] = (i * 13) & 0xff;
    }
    expect(colourShare(16, 16, RGB, data, 1)).toBe(1);
  });

  it('laesst durchsichtige Punkte ganz aus der Stichprobe', () => {
    // Drei Punkte, davon zwei durchsichtig; nur der deckende zaehlt — und der
    // ist fuer sich genommen eine Farbe auf eine Probe, also voll.
    const data = new Uint8Array([1, 1, 1, 0, 9, 9, 9, 255, 2, 2, 2, 0]);
    expect(colourShare(3, 1, RGBA, data, 1)).toBe(1);
  });

  it('rettet die freigestellte Illustration auf viel Luft', () => {
    // Der gefluegelte Dolch fuellt keinen Fuenftel seiner Bildflaeche. Zaehlte
    // die Luft mit, sackte sein Farbanteil unter jede Schwelle.
    const data = new Uint8Array(20 * 20 * 4);
    for (let i = 0; i < 20 * 20; i++) {
      const opaque = i < 20; // nur die erste Zeile traegt das Bild
      data[i * 4] = opaque ? i * 11 : 255;
      data[i * 4 + 1] = opaque ? i * 3 : 255;
      data[i * 4 + 2] = opaque ? i * 7 : 255;
      data[i * 4 + 3] = opaque ? 255 : 0;
    }
    expect(colourShare(20, 20, RGBA, data, 1)).toBe(1);
  });

  it('meldet ein Bild ganz ohne deckende Punkte als arm', () => {
    expect(colourShare(2, 1, RGBA, new Uint8Array(8), 1)).toBe(0);
  });

  it('duennt nach dem Schrittmass aus', () => {
    const data = new Uint8Array(10 * 10 * 3);
    // Nur jeder zweite Punkt bekommt eine eigene Farbe.
    for (let i = 0; i < 100; i++) data[i * 3] = i % 2 === 0 ? i : 0;
    // Schrittmass 2 trifft genau die geraden Spalten und Zeilen.
    expect(colourShare(10, 10, RGB, data, 2)).toBeGreaterThan(
      colourShare(10, 10, RGB, data, 1),
    );
  });
});
