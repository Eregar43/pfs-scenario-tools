import { describe, expect, it } from 'vitest';
import { kartenWaende, wandSignaturen } from '../src/world/waende.ts';

/**
 * Wand- und Tuerzahlen sowie Leinwandgroessen der gezeichneten Szenen, in
 * Foundry gegengeprueft — der Export soll genau das liefern.
 */
const GEZEICHNET: Record<string, { waende: number; tueren: number; leinwand: [number, number] }> = {
  '08-01/the-laboratory': { waende: 97, tueren: 7, leinwand: [2650, 2130] },
  '08-01/the-laboratory-2': { waende: 94, tueren: 7, leinwand: [2650, 2130] },
  '08-02/delusions-of-grandeur': { waende: 57, tueren: 0, leinwand: [1325, 1065] },
  '08-03/the-solstice-theater': { waende: 71, tueren: 7, leinwand: [2168, 2660] },
  '08-04/the-sinister-stevedores': { waende: 31, tueren: 6, leinwand: [2650, 2130] },
  '08-04/the-gallivanting-ghoul': { waende: 134, tueren: 17, leinwand: [2650, 1846] },
};

describe('kartenWaende', () => {
  it('kennt alle gezeichneten Karten mit den geprueften Zahlen', () => {
    for (const [schluessel, soll] of Object.entries(GEZEICHNET)) {
      const [szenario, datei] = schluessel.split('/') as [string, string];
      const waende = kartenWaende(szenario, datei);
      expect(waende, schluessel).toHaveLength(soll.waende);
      // Tueren einschliesslich Geheimtueren (door 2, die Solstice-Buehne hat
      // eine) — wie die Zaehlung des Export-Werkzeugs.
      const tueren = waende?.filter((wand) => (wand.door as number) > 0);
      expect(tueren, schluessel).toHaveLength(soll.tueren);
    }
  });

  it('liefert fuer unvermessene Karten nichts', () => {
    expect(kartenWaende('08-01', 'gibt-es-nicht')).toBeUndefined();
    expect(kartenWaende('08-99', 'the-laboratory')).toBeUndefined();
  });

  it('hat nur vollstaendige Koordinaten nahe der Leinwand', () => {
    // Die Schranke fängt Masstabsfehler ab (etwa Waende von der halben
    // Leinwand). Ein Kaestchen Luft ist erlaubt: Beim Schnappen an die
    // Aussenkante ragen Waende in Foundry leicht ueber den Rand.
    const LUFT = 90;
    for (const [schluessel, soll] of Object.entries(GEZEICHNET)) {
      const [szenario, datei] = schluessel.split('/') as [string, string];
      const [breite, hoehe] = soll.leinwand;
      for (const wand of kartenWaende(szenario, datei) ?? []) {
        expect(wand.c, schluessel).toHaveLength(4);
        wand.c.forEach((wert, index) => {
          expect(wert, schluessel).toBeGreaterThanOrEqual(-LUFT);
          expect(wert, schluessel).toBeLessThanOrEqual((index % 2 === 0 ? breite : hoehe) + LUFT);
        });
      }
    }
  });
});

describe('wandSignaturen', () => {
  const wand = { c: [0, 0, 10, 0], move: 20, sight: 20, door: 0, ds: 0 };
  const tuer = { c: [10, 0, 10, 10], move: 20, sight: 20, door: 1, ds: 0 };

  it('ist von der Reihenfolge unabhaengig', () => {
    expect(wandSignaturen([wand, tuer])).toBe(wandSignaturen([tuer, wand]));
  });

  it('sieht eine geaenderte Wand', () => {
    const verschoben = { ...wand, c: [0, 0, 12, 0] };
    expect(wandSignaturen([wand, tuer])).not.toBe(wandSignaturen([verschoben, tuer]));
    expect(wandSignaturen([wand])).not.toBe(wandSignaturen([wand, tuer]));
  });

  it('ignoriert Felder ausserhalb des Exports', () => {
    const mitRest = { ...wand, flags: { levels: true }, threshold: { light: 5 } };
    expect(wandSignaturen([mitRest])).toBe(wandSignaturen([wand]));
  });
});
