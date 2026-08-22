import { describe, expect, it } from 'vitest';
import { baueNsc, nscNotiz, sammleNscs, NSC_BLATT } from '../src/world/nscs.ts';
import type { PersonenBild } from '../src/world/bilder.ts';

/**
 * Die Bilder sind der Bestand aus 8-04, wie er unter `pfs/pfs_s08_04/`
 * tatsaechlich liegt: Portraets im Fliesstext und dieselben Personen noch
 * einmal im Anhang „Game Aids".
 */
const bild = (
  name: string,
  file: string,
  anhang: boolean,
): PersonenBild => ({ name, file, anhang, pfad: `pfs/pfs_s08_04/${file}.webp` });

describe('sammleNscs', () => {
  it('nimmt nur Personen aus dem Anhang', () => {
    const nscs = sammleNscs(
      [bild('Tolla', 'tolla', false), bild('Emrick', 'emrick', true)],
      [],
    );

    expect(nscs.map((n) => n.name)).toEqual(['Emrick']);
    expect(nscs[0]!.bild).toBe('pfs/pfs_s08_04/emrick.webp');
  });

  it('laesst aus, wer schon einen Statblock hat', () => {
    // Captain Ashfell Grimme ist eine Variante aus dem Kompendium und
    // entsteht als Kreatur — ein zweiter Actor waere eine Dublette.
    const nscs = sammleNscs(
      [
        bild('Captain Ashfell Grimme', 'captain-ashfell-grimme', true),
        bild('Tolla', 'tolla-2', true),
      ],
      ['Captain Ashfell Grimme'],
    );

    expect(nscs.map((n) => n.name)).toEqual(['Tolla']);
  });

  it('erkennt den Statblock auch hinter Elite und Schwach', () => {
    expect(sammleNscs([bild('Bodyguard', 'bodyguard', true)], ['Weak Bodyguard'])).toEqual([]);
  });

  it('nimmt jeden Namen nur einmal', () => {
    const nscs = sammleNscs(
      [bild('Tolla', 'tolla', true), bild('tolla', 'tolla-2', true)],
      [],
    );

    expect(nscs).toHaveLength(1);
    expect(nscs[0]!.file).toBe('tolla');
  });

  it('uebergeht Bilder ohne Dateinamen und ohne Namen', () => {
    expect(sammleNscs([{ name: 'Tolla', pfad: 'k.webp', anhang: true }], [])).toEqual([]);
    expect(sammleNscs([bild('', 'leer', true)], [])).toEqual([]);
  });
});

describe('baueNsc', () => {
  const daten = baueNsc({
    name: 'Tolla',
    bild: 'pfs/pfs_s08_04/tolla.webp',
    file: 'tolla',
    quelle: 'Pathfinder Society Scenario #8-04: A Theft in Harborgate',
  });

  it('baut den schlanken NSC nach dem Vorbild der Season-Module', () => {
    // Nachgesehen an `Verren Sallo` aus dem Season-7-Modul in der
    // laufenden Welt: Stufe 1, 10 Trefferpunkte, sonst nichts.
    expect(daten).toMatchObject({
      name: 'Tolla',
      type: 'npc',
      img: 'pfs/pfs_s08_04/tolla.webp',
      flags: { core: { sheetClass: NSC_BLATT } },
    });
    expect(daten.system).toMatchObject({
      attributes: { hp: { value: 10, max: 10 } },
      details: { level: { value: 1 } },
      traits: { rarity: 'unique' },
    });
  });

  it('bringt keine Gegenstaende mit', () => {
    expect(daten.items).toEqual([]);
  });

  it('steht neutral zur Gruppe', () => {
    // `null` ist im System ausdruecklich Neutral. Fehlte das Feld, gaelte der
    // Standard eines npc — die Gegenseite, mitsamt Flankieren.
    const details = (daten.system as { details: Record<string, unknown> }).details;
    expect(details.alliance).toBeNull();
    expect('alliance' in details).toBe(true);
  });

  it('traegt das Heft als Quelle', () => {
    expect((daten.system as { details: { publication: unknown } }).details.publication).toEqual({
      title: 'Pathfinder Society Scenario #8-04: A Theft in Harborgate',
      authors: '',
      license: 'ORC',
      remaster: true,
    });
  });

  it('laesst die Quelle leer, wenn keine mitkommt', () => {
    const ohne = baueNsc({ name: 'Tolla', bild: 'k.webp', file: 'tolla' });
    expect((ohne.system as { details: { publication: { title: string } } }).details.publication.title).toBe('');
  });
});

describe('nscNotiz', () => {
  it('verweist auf die Bildseite im Spielhilfen-Journal', () => {
    expect(nscNotiz('abcdefghijklmnop', '1234567890abcdef', 'Tolla')).toBe(
      '<p>@UUID[JournalEntry.abcdefghijklmnop.JournalEntryPage.1234567890abcdef]{Tolla}</p>',
    );
  });
});
