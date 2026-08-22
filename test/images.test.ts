import { describe, expect, it } from 'vitest';
import { colourShare, imageRole, GRAYSCALE, RGB, RGBA } from '../src/pdf/images.ts';

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
