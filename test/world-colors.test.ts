import { describe, expect, it } from 'vitest';
import { abgedunkelt, aufgehellt, defaultColorFor, officialColorFor } from '../src/world/colors.ts';

/** Mittlere Helligkeit eines Hex-Werts, grob — reicht zum Vergleichen. */
function helligkeit(farbe: string): number {
  return [1, 3, 5].reduce((summe, v) => summe + Number.parseInt(farbe.slice(v, v + 2), 16), 0) / 3;
}

/** Farbton in Grad, damit Blau nicht heimlich zu Gruen wird. */
function farbton(farbe: string): number {
  const [r, g, b] = [1, 3, 5].map((v) => Number.parseInt(farbe.slice(v, v + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const hoch = Math.max(r, g, b);
  const spanne = hoch - Math.min(r, g, b);
  if (spanne === 0) return 0;
  const h =
    hoch === r
      ? ((g - b) / spanne + (g < b ? 6 : 0)) / 6
      : hoch === g
        ? ((b - r) / spanne + 2) / 6
        : ((r - g) / spanne + 4) / 6;
  return h * 360;
}

describe('aufgehellt', () => {
  it('macht jede Jahrgangsfarbe hell genug fuer dunklen Grund', () => {
    for (const season of [4, 5, 6, 7, 8, 9]) {
      const farbe = defaultColorFor(season);
      expect(helligkeit(aufgehellt(farbe)), farbe).toBeGreaterThan(140);
    }
  });

  it('behaelt den Farbton — Blau bleibt Blau', () => {
    // Season 5 ist Paizos dunkles Blau. Eine Mischung gegen Creme machte
    // daraus Graugruen; das war der Anlass, in HSL zu rechnen.
    const dunkel = officialColorFor(5)!;
    const hell = aufgehellt(dunkel);
    expect(Math.abs(farbton(hell) - farbton(dunkel))).toBeLessThan(6);
    expect(helligkeit(hell)).toBeGreaterThan(helligkeit(dunkel) + 80);
  });

  it('laesst helle Farben in Ruhe und deckelt die Saettigung', () => {
    // Schon hell genug: die Helligkeit bleibt, nur grelle Saettigung faellt.
    const hell = aufgehellt('#ffd0d0');
    expect(helligkeit(hell)).toBeGreaterThan(helligkeit('#ffd0d0') - 10);
  });

  it('gibt Unbrauchbares unveraendert zurueck', () => {
    expect(aufgehellt('rot')).toBe('rot');
    expect(aufgehellt('#12345')).toBe('#12345');
    expect(aufgehellt('')).toBe('');
  });

  it('versteht die Kurzform mit drei Zeichen', () => {
    expect(aufgehellt('#00f')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('abgedunkelt', () => {
  it('macht jede Jahrgangsfarbe dunkel genug fuer helle Schrift', () => {
    for (const season of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]) {
      const farbe = defaultColorFor(season);
      // Auch die hellen Palettenfarben (#b7950b, #d68910) muessen tief genug
      // liegen, sonst steht die Leiste je Jahrgang anders da.
      expect(helligkeit(abgedunkelt(farbe)), farbe).toBeLessThan(105);
    }
  });

  it('behaelt den Farbton', () => {
    const hell = '#2e86c1';
    expect(Math.abs(farbton(abgedunkelt(hell)) - farbton(hell))).toBeLessThan(6);
  });

  it('laesst schon dunkle Farben in Ruhe', () => {
    expect(abgedunkelt('#003655')).toBe('#003655');
  });

  it('gibt Unbrauchbares unveraendert zurueck', () => {
    expect(abgedunkelt('rot')).toBe('rot');
  });
});
