import { describe, expect, it } from 'vitest';
import { MODULE_ID } from '../src/world/flags.ts';
import {
  befund,
  bestandAus,
  verwaisteSeasonOrdner,
  type SzenarioBestand,
} from '../src/world/bestand.ts';
import type { Weltabbild } from '../src/world/plan.ts';

function flag(werte: Record<string, unknown>): { flags: Record<string, Record<string, unknown>> } {
  return { flags: { [MODULE_ID]: werte } };
}

describe('bestandAus', () => {
  it('sammelt alles eines Szenarios unter seinem Schluessel', () => {
    const welt: Weltabbild = {
      ordner: [
        { id: 'OJ', name: '8-01 Intro', elternId: 'S', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01', season: 8 }) },
        { id: 'S', name: 'Season 8', elternId: null, farbe: null, ...flag({ kind: 'seasonFolder', season: 8 }) },
      ],
      journale: [
        {
          id: 'J', name: '8-01 Intro', ordnerId: 'OJ',
          ...flag({ kind: 'journal', scenario: '08-01', season: 8, importedAt: '2026-08-13T10:00:00Z', sourceHash: 'abcd' }),
          seiten: [
            { id: 'a'.repeat(16), name: 'Eins', inhalt: '' },
            { id: 'b'.repeat(16), name: 'Zwei', inhalt: '' },
          ],
        },
        {
          id: 'GA', name: 'Game Aids', ordnerId: 'OJ',
          ...flag({ kind: 'anhangJournal', scenario: '08-01', season: 8, importedAt: '2026-08-13T11:00:00Z' }),
          seiten: [{ id: 'c'.repeat(16), name: 'Ella', inhalt: 'x.webp' }],
        },
        {
          id: 'HO', name: 'Handouts', ordnerId: 'OJ',
          ...flag({ kind: 'handoutJournal', scenario: '08-01', season: 8, importedAt: '2026-08-13T10:30:00Z' }),
          seiten: [{ id: 'h'.repeat(16), name: 'Handout 1: The Note', inhalt: '<p>x</p>' }],
        },
        { id: 'FREMD', name: 'Notizen', ordnerId: null, seiten: [] },
      ],
      szenenOrdner: [
        { id: 'OS', name: '8-01 Intro', elternId: 'SS', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01', season: 8 }) },
      ],
      szenen: [
        { id: 'SZ1', name: 'The Laboratory', ordnerId: 'OS', hintergrund: 'k.webp', ...flag({ kind: 'scene', scenario: '08-01', season: 8 }) },
        { id: 'SZ2', name: 'Eigene Szene', ordnerId: null, hintergrund: '' },
      ],
      aktorenOrdner: [
        { id: 'OA', name: '8-01 Intro', elternId: 'SA', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01', season: 8 }) },
      ],
      aktoren: [
        { id: 'A1', name: 'Poppet Mage', ordnerId: 'OA', ...flag({ kind: 'actor', scenario: '08-01', season: 8 }) },
        { id: 'A2', name: 'Spielercharakter', ordnerId: null },
      ],
    };

    const bestaende = bestandAus(welt);
    expect(bestaende).toHaveLength(1);
    const b = bestaende[0]!;
    expect(b.schluessel).toBe('08-01');
    expect(b.journal).toEqual({ id: 'J', name: '8-01 Intro', seiten: 2 });
    expect(b.anhang).toEqual({ id: 'GA', name: 'Game Aids', seiten: 1 });
    expect(b.handouts).toEqual({ id: 'HO', name: 'Handouts', seiten: 1 });
    expect(b.szenen).toEqual([{ id: 'SZ1', name: 'The Laboratory' }]);
    expect(b.aktoren).toEqual([{ id: 'A1', name: 'Poppet Mage' }]);
    // Drei Szenario-Ordner (Journal, Szene, Actor); die Season-Ordner nicht.
    expect(b.ordner.map((o) => o.id).sort()).toEqual(['OA', 'OJ', 'OS']);
    // Der juengste Importzeitpunkt gewinnt.
    expect(b.importedAt).toBe('2026-08-13T11:00:00Z');
    expect(b.sourceHash).toBe('abcd');
  });

  it('trennt zwei Szenarien und sortiert nach Schluessel', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [
        { id: 'J2', name: '8-02', ordnerId: null, ...flag({ kind: 'journal', scenario: '08-02' }), seiten: [] },
        { id: 'J1', name: '8-01', ordnerId: null, ...flag({ kind: 'journal', scenario: '08-01' }), seiten: [] },
      ],
    };
    expect(bestandAus(welt).map((b) => b.schluessel)).toEqual(['08-01', '08-02']);
  });

  it('liefert nichts in einer Welt ohne Importe', () => {
    expect(bestandAus({ ordner: [], journale: [] })).toEqual([]);
  });
});

describe('befund', () => {
  const bestand = (
    soll: SzenarioBestand['soll'],
    ist: { seiten?: number; anhang?: number; handouts?: number; szenen?: number; aktoren?: number } = {},
  ): SzenarioBestand => ({
    schluessel: '08-01',
    ...(ist.seiten !== undefined
      ? { journal: { id: 'J', name: '8-01 Intro', seiten: ist.seiten } }
      : {}),
    ...(ist.anhang !== undefined
      ? { anhang: { id: 'GA', name: 'Game Aids', seiten: ist.anhang } }
      : {}),
    ...(ist.handouts !== undefined
      ? { handouts: { id: 'HO', name: 'Handouts', seiten: ist.handouts } }
      : {}),
    szenen: Array.from({ length: ist.szenen ?? 0 }, (_, i) => ({ id: `S${i}`, name: `Szene ${i}` })),
    effekte: [],
    aktoren: Array.from({ length: ist.aktoren ?? 0 }, (_, i) => ({ id: `A${i}`, name: `Actor ${i}` })),
    ordner: [],
    ...(soll ? { soll } : {}),
  });

  const VOLL = { seiten: 15, anhangSeiten: 4, szenen: 2, aktoren: 7, bilder: 13 };

  it('meldet vollstaendig, wenn alles da ist', () => {
    const zeilen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }), 13);
    expect(zeilen.every((z) => z.zustand === 'vollstaendig')).toBe(true);
    expect(zeilen.map((z) => z.teil)).toEqual(['journal', 'anhang', 'szenen', 'aktoren', 'bilder']);
    // `effekte` fehlt: Die Soll-Zahl kennt dieses Szenario nicht (Soll 0).
  });

  it('unterscheidet fehlt von unvollstaendig', () => {
    // Eine von zwei Szenen geloescht, alle sieben Actors weg.
    const zeilen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 1, aktoren: 0 }), 13);
    const nach = (teil: string) => zeilen.find((z) => z.teil === teil);

    expect(nach('szenen')).toMatchObject({ ist: 1, soll: 2, zustand: 'unvollstaendig' });
    expect(nach('aktoren')).toMatchObject({ ist: 0, soll: 7, zustand: 'fehlt' });
  });

  it('haelt mehr als erwartet fuer vollstaendig', () => {
    // Der Spielleiter hat eine eigene Szene dazugestellt — sein gutes Recht.
    const zeilen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 3, aktoren: 7 }), 13);
    expect(zeilen.find((z) => z.teil === 'szenen')?.zustand).toBe('vollstaendig');
  });

  it('schweigt ueber Bestandteile, die es zur Importzeit noch nicht gab', () => {
    // Ein Import aus 0.6.0 kennt seine Zahlen, aber keine Effekte. „Effekte 0
    // (Sollwert unbekannt)" waere dort eine Falschmeldung.
    const zeilen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }), 13);
    expect(zeilen.map((z) => z.teil)).not.toContain('effekte');

    const mitEffekten = befund(
      bestand({ ...VOLL, effekte: 2 }, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }),
      13,
    );
    expect(mitEffekten.find((z) => z.teil === 'effekte')).toMatchObject({
      ist: 0,
      soll: 2,
      zustand: 'fehlt',
    });
  });

  it('zaehlt die Handouts, sobald der Import sie kennt', () => {
    // Aelterer Import ohne die Zahl: keine Zeile, keine Falschmeldung.
    const ohne = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }), 13);
    expect(ohne.map((z) => z.teil)).not.toContain('handouts');

    const mit = befund(
      bestand({ ...VOLL, handoutSeiten: 1 }, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }),
      13,
    );
    expect(mit.find((z) => z.teil === 'handouts')).toMatchObject({ ist: 0, soll: 1, zustand: 'fehlt' });

    const da = befund(
      bestand({ ...VOLL, handoutSeiten: 1 }, { seiten: 15, anhang: 4, handouts: 1, szenen: 2, aktoren: 7 }),
      13,
    );
    expect(da.find((z) => z.teil === 'handouts')?.zustand).toBe('vollstaendig');
  });

  it('sagt unbekannt statt zu raten, wenn die Soll-Zahlen fehlen', () => {
    // Vor 0.6.0 importiert: Es gibt keinen Vergleichswert, und einen zu
    // erfinden waere schlimmer als die Luecke zu zeigen.
    const zeilen = befund(bestand(undefined, { seiten: 15, szenen: 2 }), 13);
    expect(zeilen.every((z) => z.zustand === 'unbekannt')).toBe(true);
    expect(zeilen.every((z) => z.soll === undefined)).toBe(true);
  });

  it('haelt nicht nachgesehene Bilder von null Bildern auseinander', () => {
    const nichtNachgesehen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }));
    expect(nichtNachgesehen.find((z) => z.teil === 'bilder')).toMatchObject({
      zustand: 'unbekannt',
    });

    const nachgesehen = befund(bestand(VOLL, { seiten: 15, anhang: 4, szenen: 2, aktoren: 7 }), 0);
    expect(nachgesehen.find((z) => z.teil === 'bilder')).toMatchObject({ zustand: 'fehlt' });
  });

  it('laesst weg, was es nie gab', () => {
    // Ein Szenario ohne Kreaturen soll keine leere Actors-Zeile bekommen.
    const zeilen = befund(bestand({ ...VOLL, aktoren: 0, anhangSeiten: 0 }, { seiten: 15 }), 13);
    expect(zeilen.map((z) => z.teil)).toEqual(['journal', 'szenen', 'bilder']);
  });

  it('liest die Soll-Zahlen aus dem Flag des Hauptjournals', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [
        {
          id: 'J',
          name: '8-01 Intro',
          ordnerId: null,
          ...flag({
            kind: 'journal',
            scenario: '08-01',
            season: 8,
            toolVersion: '0.5.0',
            soll: VOLL,
          }),
          seiten: [],
        },
      ],
    };

    const [eintrag] = bestandAus(welt);
    expect(eintrag?.soll).toEqual(VOLL);
    expect(eintrag?.toolVersion).toBe('0.5.0');
  });
});

describe('verwaisteSeasonOrdner', () => {
  /** Eine Welt mit einem Season-Ordner, einem Szenario-Ordner und einem Journal. */
  function welt(zusatz: Partial<Weltabbild> = {}): Weltabbild {
    return {
      ordner: [
        { id: 'S8', name: 'Season 8 - Year of Clockwork Mystery', elternId: null, farbe: null, ...flag({ kind: 'seasonFolder', season: 8 }) },
        { id: 'O1', name: '8-01 Intro', elternId: 'S8', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01', season: 8 }) },
      ],
      journale: [
        { id: 'J1', name: '8-01 Intro', ordnerId: 'O1', ...flag({ kind: 'journal', scenario: '08-01', season: 8 }), seiten: [] },
      ],
      ...zusatz,
    };
  }

  function bestand801(): SzenarioBestand {
    return {
      schluessel: '08-01',
      season: 8,
      journal: { id: 'J1', name: '8-01 Intro', seiten: 0 },
      szenen: [],
      aktoren: [],
      effekte: [],
      ordner: [{ id: 'O1', name: '8-01 Intro' }],
    };
  }

  it('nennt den Season-Ordner, wenn nach dem Zug nichts mehr darin steht', () => {
    const treffer = verwaisteSeasonOrdner(welt(), [bestand801()]);
    expect(treffer.map((o) => o.id)).toEqual(['S8']);
  });

  it('laesst ihn stehen, solange ein zweites Szenario darin wohnt', () => {
    const mitZweitem = welt({
      ordner: [
        ...welt().ordner,
        { id: 'O2', name: '8-02 Fey', elternId: 'S8', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-02', season: 8 }) },
      ],
    });
    expect(verwaisteSeasonOrdner(mitZweitem, [bestand801()])).toEqual([]);
  });

  it('laesst ihn stehen, wenn eigenes des Spielleiters darin liegt', () => {
    // Ein Journal ohne unser Flag, direkt im Season-Ordner: nicht unseres,
    // also faellt der Ordner nicht.
    const mitFremdem = welt({
      journale: [
        ...welt().journale,
        { id: 'X', name: 'Meine Notizen', ordnerId: 'S8', seiten: [] },
      ],
    });
    expect(verwaisteSeasonOrdner(mitFremdem, [bestand801()])).toEqual([]);
  });

  it('nimmt einen adoptierten Season-Ordner ohne Flag mit', () => {
    // Der Ordner kann von Hand oder von showstopping_tools stammen; erkannt
    // wird er dann am Namen auf oberster Ebene — wie beim Import auch.
    const adoptiert = welt({
      ordner: [
        { id: 'S8', name: 'Season 8 - Year of Clockwork Mystery', elternId: null, farbe: null },
        { id: 'O1', name: '8-01 Intro', elternId: 'S8', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01', season: 8 }) },
      ],
    });
    expect(verwaisteSeasonOrdner(adoptiert, [bestand801()]).map((o) => o.id)).toEqual(['S8']);
  });

  it('fasst eine fremde Season nicht an', () => {
    const mitSeason7 = welt({
      ordner: [
        ...welt().ordner,
        { id: 'S7', name: "Season 7 - Year of Battle's Spark", elternId: null, farbe: null },
      ],
    });
    expect(verwaisteSeasonOrdner(mitSeason7, [bestand801()]).map((o) => o.id)).toEqual(['S8']);
  });

  it('prueft jede Dokumentart fuer sich', () => {
    // Derselbe Season-Ordner existiert je Dokumentart einmal. Steht in der
    // Szenen-Fassung noch eine fremde Szene, faellt nur die Journal-Fassung.
    const mitSzenen = welt({
      szenenOrdner: [
        { id: 'S8s', name: 'Season 8 - Year of Clockwork Mystery', elternId: null, farbe: null, ...flag({ kind: 'seasonFolder', season: 8 }) },
      ],
      szenen: [{ id: 'Sz', name: 'Eigene Karte', ordnerId: 'S8s', hintergrund: '' }],
    });
    expect(verwaisteSeasonOrdner(mitSzenen, [bestand801()]).map((o) => o.id)).toEqual(['S8']);
  });
});
