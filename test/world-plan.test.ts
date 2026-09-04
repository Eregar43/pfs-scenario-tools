import { describe, expect, it } from 'vitest';
import { MODULE_ID } from '../src/world/flags.ts';
import { planeImport, type Weltabbild, type Wunsch } from '../src/world/plan.ts';
import { wandSignaturen } from '../src/world/waende.ts';

const LEER: Weltabbild = { ordner: [], journale: [] };

function wunsch(ueberschreibungen: Partial<Wunsch> = {}): Wunsch {
  return {
    season: 8,
    schluessel: '08-01',
    seasonOrdnerName: 'Season 8 - Year of Clockwork Mystery',
    szenarioOrdnerName: '8-01 Intro to the Year',
    journalName: '8-01 Intro to the Year',
    seiten: [
      { id: 'aaaaaaaaaaaaaaaa', name: 'Adventure Background', inhalt: '<p>eins</p>' },
      { id: 'bbbbbbbbbbbbbbbb', name: 'Getting Started', inhalt: '<p>zwei</p>' },
    ],
    ...ueberschreibungen,
  };
}

function flag(werte: Record<string, unknown>): { flags: Record<string, Record<string, unknown>> } {
  return { flags: { [MODULE_ID]: werte } };
}

describe('planeImport — leere Welt', () => {
  it('legt beide Ordner und das Journal an', () => {
    const plan = planeImport(LEER, wunsch());

    expect(plan.seasonOrdner).toEqual({
      art: 'anlegen',
      name: 'Season 8 - Year of Clockwork Mystery',
      farbe: '#a04000',
    });
    expect(plan.szenarioOrdner.art).toBe('anlegen');
    expect(plan.journal.art).toBe('anlegen');
    expect(plan.seiten.neu).toEqual(['Adventure Background', 'Getting Started']);
    expect(plan.seiten.entfallen).toEqual([]);
  });
});

describe('planeImport — vorhandene Ordner', () => {
  it('uebernimmt einen von Hand angelegten Season-Ordner ueber den Namen', () => {
    // Der Adoptionspfad: der Ordner kann von showstopping_tools oder von Hand
    // stammen und traegt dann kein Flag von uns.
    const welt: Weltabbild = {
      ordner: [{ id: 'S', name: 'Season 8 - Eigener Zusatz', elternId: null, farbe: '#123456' }],
      journale: [],
    };

    const plan = planeImport(welt, wunsch());

    // Behalten, nicht umfaerben: Season 8 hat keine Hausfarbe, und eine
    // geratene Palettenfarbe ueberschreibt keine handgewaehlte.
    expect(plan.seasonOrdner).toEqual({ art: 'behalten', id: 'S', name: 'Season 8 - Eigener Zusatz' });
    expect(plan.szenarioOrdner).toMatchObject({ art: 'anlegen', elternId: 'S' });
  });

  it('erzwingt Paizos Hausfarbe auch auf einem vorhandenen Ordner', () => {
    const welt: Weltabbild = {
      ordner: [{ id: 'S', name: 'Season 7', elternId: null, farbe: '#ffffff' }],
      journale: [],
    };

    const plan = planeImport(
      welt,
      wunsch({ season: 7, schluessel: '07-02', seasonOrdnerName: 'Season 7' }),
    );

    expect(plan.seasonOrdner).toEqual({
      art: 'umfaerben',
      id: 'S',
      name: 'Season 7',
      farbe: '#246865',
    });
  });

  it('erkennt den Szenario-Ordner auch bei abweichender Schreibweise und Titel', () => {
    const welt: Weltabbild = {
      ordner: [
        { id: 'S', name: 'Season 8', elternId: null, farbe: null },
        { id: 'X', name: '08-01 Anderer Titel', elternId: 'S', farbe: null },
      ],
      journale: [],
    };

    const plan = planeImport(welt, wunsch());

    // Wiedererkannt — und weil er farblos ist, bekommt er die Season-Farbe.
    expect(plan.szenarioOrdner).toEqual({
      art: 'umfaerben',
      id: 'X',
      name: '08-01 Anderer Titel',
      farbe: '#a04000',
    });
  });

  it('greift nicht auf einen gleichnamigen Ordner unter einem anderen Jahrgang', () => {
    const welt: Weltabbild = {
      ordner: [
        { id: 'S7', name: 'Season 7', elternId: null, farbe: null },
        { id: 'X', name: '8-01 Intro to the Year', elternId: 'S7', farbe: null },
      ],
      journale: [],
    };

    const plan = planeImport(welt, wunsch());

    expect(plan.seasonOrdner.art).toBe('anlegen');
    expect(plan.szenarioOrdner.art).toBe('anlegen');
  });
});

describe('planeImport — zweiter Lauf', () => {
  const welt: Weltabbild = {
    ordner: [
      { id: 'S', name: 'Season 8', elternId: null, farbe: null, ...flag({ kind: 'seasonFolder', season: 8 }) },
      { id: 'X', name: '8-01 Intro to the Year', elternId: 'S', farbe: null, ...flag({ kind: 'scenarioFolder', scenario: '08-01' }) },
    ],
    journale: [
      {
        id: 'J',
        name: '8-01 Intro to the Year',
        ordnerId: 'X',
        ...flag({ kind: 'journal', scenario: '08-01' }),
        seiten: [
          { id: 'aaaaaaaaaaaaaaaa', name: 'Adventure Background', inhalt: '<p>eins</p>' },
          { id: 'cccccccccccccccc', name: 'Alte Seite', inhalt: '<p>weg</p>' },
        ],
      },
    ],
  };

  it('aktualisiert statt zu verdoppeln', () => {
    const plan = planeImport(welt, wunsch());

    expect(plan.seasonOrdner.art).toBe('behalten');
    // Der farblose Szenario-Ordner wird dabei in die Season-Farbe getaucht.
    expect(plan.szenarioOrdner).toMatchObject({ art: 'umfaerben', id: 'X', farbe: '#a04000' });
    expect(plan.journal).toMatchObject({ art: 'aktualisieren', id: 'J' });
  });

  it('trennt Seiten nach neu, geaendert, unveraendert und entfallen', () => {
    const plan = planeImport(welt, wunsch());

    expect(plan.seiten.unveraendert).toEqual(['Adventure Background']);
    expect(plan.seiten.neu).toEqual(['Getting Started']);
    expect(plan.seiten.entfallen).toEqual(['Alte Seite']);
    expect(plan.seiten.aktualisiert).toEqual([]);
  });

  it('haelt Foundrys entfernte HTML-Kommentare nicht fuer eine Aenderung', () => {
    // Foundry loescht Kommentare beim Speichern. Was aus der Welt zurueckkommt,
    // ist deshalb nie zeichengleich mit dem, was hineingeschrieben wurde —
    // ohne Angleichung galten genau die Seiten mit Bildunterschrift bei jedem
    // Lauf als geaendert.
    const ausDerWelt: Weltabbild = {
      ...welt,
      journale: [
        {
          ...welt.journale[0]!,
          seiten: [
            { id: 'aaaaaaaaaaaaaaaa', name: 'Adventure Background', inhalt: '<p>eins</p>' },
          ],
        },
      ],
    };

    const plan = planeImport(
      ausDerWelt,
      wunsch({
        seiten: [
          {
            id: 'aaaaaaaaaaaaaaaa',
            name: 'Adventure Background',
            inhalt: '<p>eins</p>\n<!-- Bildunterschrift: Zarta Dralneen -->',
          },
        ],
      }),
    );

    expect(plan.seiten.unveraendert).toEqual(['Adventure Background']);
    expect(plan.seiten.aktualisiert).toEqual([]);
  });

  it('meldet geaenderten Inhalt bei gleicher Kennung', () => {
    const plan = planeImport(
      welt,
      wunsch({
        seiten: [
          { id: 'aaaaaaaaaaaaaaaa', name: 'Adventure Background', inhalt: '<p>NEU</p>' },
        ],
      }),
    );

    expect(plan.seiten.aktualisiert).toEqual(['Adventure Background']);
    expect(plan.seiten.unveraendert).toEqual([]);
  });

  it('findet das Journal ueber sein Flag, auch wenn es umbenannt wurde', () => {
    const umbenannt: Weltabbild = {
      ...welt,
      journale: [{ ...welt.journale[0]!, name: 'Von Hand umbenannt' }],
    };

    const plan = planeImport(umbenannt, wunsch());

    expect(plan.journal).toMatchObject({
      art: 'aktualisieren',
      id: 'J',
      alterName: 'Von Hand umbenannt',
    });
  });
});

describe('planeImport — fremde Journale', () => {
  it('uebernimmt kein gleichnamiges Journal aus einem anderen Ordner', () => {
    // Ohne Flag und am falschen Ort: lieber ein zweites anlegen, als sich an
    // etwas zu vergreifen, das jemand anders gebaut hat.
    const welt: Weltabbild = {
      ordner: [{ id: 'S', name: 'Season 8', elternId: null, farbe: null }],
      journale: [{ id: 'FREMD', name: '8-01 Intro to the Year', ordnerId: null, seiten: [] }],
    };

    const plan = planeImport(welt, wunsch());

    expect(plan.journal.art).toBe('anlegen');
  });
});

describe('planeImport — Spielhilfen-Journal', () => {
  const mitAnhang = (): Wunsch =>
    wunsch({
      anhang: {
        journalName: 'Game Aids',
        seiten: [
          { id: 'cccccccccccccccc', name: 'Ella', inhalt: 'pfs/pfs_s08_01/personen/ella-2.webp' },
          { id: 'dddddddddddddddd', name: 'Poppet Mage', inhalt: 'pfs/pfs_s08_01/personen/poppet-mage.webp' },
        ],
      },
    });

  it('plant es als Neuanlage, wenn es fehlt', () => {
    const plan = planeImport(LEER, mitAnhang());

    expect(plan.anhang?.journal).toEqual({ art: 'anlegen', name: 'Game Aids' });
    expect(plan.anhang?.seiten.neu).toEqual(['Ella', 'Poppet Mage']);
  });

  it('bleibt aus, wenn der Wunsch keines enthaelt', () => {
    expect(planeImport(LEER, wunsch()).anhang).toBeUndefined();
  });

  it('findet es ueber sein Flag und gleicht die Bildseiten ab', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [
        {
          id: 'GA',
          name: 'Alter Name',
          ordnerId: null,
          seiten: [
            // Unveraendert: gleicher Pfad. Entfallen: Kennung kommt nicht wieder.
            { id: 'cccccccccccccccc', name: 'Ella', inhalt: 'pfs/pfs_s08_01/personen/ella-2.webp' },
            { id: 'eeeeeeeeeeeeeeee', name: 'Veraltet', inhalt: 'pfs/alt.webp' },
          ],
          ...flag({ kind: 'anhangJournal', scenario: '08-01', season: 8 }),
        },
      ],
    };

    const plan = planeImport(welt, mitAnhang());

    expect(plan.anhang?.journal).toMatchObject({ art: 'aktualisieren', id: 'GA', alterName: 'Alter Name' });
    expect(plan.anhang?.seiten.neu).toEqual(['Poppet Mage']);
    expect(plan.anhang?.seiten.unveraendert).toEqual(['Ella']);
    expect(plan.anhang?.seiten.entfallen).toEqual(['Veraltet']);
  });
});

describe('planeImport — Handout-Journal', () => {
  const mitHandouts = (): Wunsch =>
    wunsch({
      handouts: {
        journalName: 'Handouts',
        seiten: [
          { id: 'hhhhhhhhhhhhhhhh', name: 'Handout 1: The Note', inhalt: '<p>Dear friends,</p>' },
        ],
      },
    });

  it('plant es als Neuanlage, wenn es fehlt', () => {
    const plan = planeImport(LEER, mitHandouts());

    expect(plan.handouts?.journal).toEqual({ art: 'anlegen', name: 'Handouts' });
    expect(plan.handouts?.seiten.neu).toEqual(['Handout 1: The Note']);
  });

  it('bleibt aus, wenn der Wunsch keines enthaelt', () => {
    expect(planeImport(LEER, wunsch()).handouts).toBeUndefined();
  });

  it('findet es ueber sein Flag und verwechselt es nicht mit den Spielhilfen', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [
        {
          id: 'GA',
          name: 'Game Aids',
          ordnerId: null,
          seiten: [],
          ...flag({ kind: 'anhangJournal', scenario: '08-01', season: 8 }),
        },
        {
          id: 'HO',
          name: 'Handouts',
          ordnerId: null,
          seiten: [
            { id: 'hhhhhhhhhhhhhhhh', name: 'Handout 1: The Note', inhalt: '<p>Old wording</p>' },
          ],
          ...flag({ kind: 'handoutJournal', scenario: '08-01', season: 8 }),
        },
      ],
    };

    const plan = planeImport(welt, mitHandouts());

    expect(plan.handouts?.journal).toMatchObject({ art: 'aktualisieren', id: 'HO' });
    expect(plan.handouts?.seiten.aktualisiert).toEqual(['Handout 1: The Note']);
    expect(plan.anhang).toBeUndefined();
  });
});

describe('planeImport — Szenen', () => {
  const mitSzenen = (): Wunsch =>
    wunsch({
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          breite: 1325,
          hoehe: 1065,
        },
        {
          id: '2222222222222222',
          name: 'The Laboratory (2)',
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory-2.webp',
          breite: 1325,
          hoehe: 1065,
        },
      ],
    });

  it('plant in einer leeren Welt Ordnerbaum und Szenen als neu', () => {
    const plan = planeImport(LEER, mitSzenen());

    expect(plan.szenen?.seasonOrdner.art).toBe('anlegen');
    expect(plan.szenen?.szenarioOrdner.art).toBe('anlegen');
    expect(plan.szenen?.szenen.neu).toEqual(['The Laboratory', 'The Laboratory (2)']);
  });

  it('bleibt aus, wenn der Wunsch keine Szenen enthaelt', () => {
    expect(planeImport(LEER, wunsch()).szenen).toBeUndefined();
  });

  it('nutzt die Journal-Ordner nicht als Szenen-Ordner', () => {
    // Foundry fuehrt Ordner je Dokumentart — ein Journal-Ordner gleichen
    // Namens darf die Szenen nicht aufnehmen.
    const welt: Weltabbild = {
      ordner: [{ id: 'J', name: 'Season 8 - Year of Clockwork Mystery', elternId: null, farbe: null }],
      journale: [],
    };

    const plan = planeImport(welt, mitSzenen());
    expect(plan.szenen?.seasonOrdner.art).toBe('anlegen');
  });

  it('erkennt Szenen an ihrer Kennung wieder und meldet Entfallenes ohne Loeschung', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      szenenOrdner: [],
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          ordnerId: null,
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
        },
        {
          id: '9999999999999999',
          name: 'Alte Karte',
          ordnerId: null,
          hintergrund: 'pfs/alt.webp',
          ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
        },
        {
          id: '8888888888888888',
          name: 'Fremde Szene',
          ordnerId: null,
          hintergrund: 'woanders.webp',
        },
      ],
    };

    const plan = planeImport(welt, mitSzenen());

    expect(plan.szenen?.szenen.unveraendert).toEqual(['The Laboratory']);
    expect(plan.szenen?.szenen.neu).toEqual(['The Laboratory (2)']);
    // Nur die eigene, nicht mehr gewuenschte Szene wird gemeldet — die
    // fremde geht den Import nichts an.
    expect(plan.szenen?.szenen.entfallen).toEqual(['Alte Karte']);
  });

  it('meldet eine Szene als geaendert, wenn ihre Waende vom Export abweichen', () => {
    const wand = { c: [0, 0, 10, 0], move: 20, sight: 20, door: 0, ds: 0 };
    const szeneInWelt = {
      id: '1111111111111111',
      name: 'The Laboratory',
      ordnerId: null,
      hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
      ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
    };
    const gewuenscht = mitSzenen();
    gewuenscht.szenen = [{ ...gewuenscht.szenen![0]!, waende: [wand] }];

    // Welt ohne Waende: die Szene braucht ein Update.
    const ohne: Weltabbild = {
      ordner: [],
      journale: [],
      szenen: [{ ...szeneInWelt, waendeSignatur: wandSignaturen([]) }],
    };
    expect(planeImport(ohne, gewuenscht).szenen?.szenen.aktualisiert).toEqual(['The Laboratory']);

    // Welt mit denselben Waenden: nichts zu tun.
    const gleich: Weltabbild = {
      ordner: [],
      journale: [],
      szenen: [{ ...szeneInWelt, waendeSignatur: wandSignaturen([wand]) }],
    };
    expect(planeImport(gleich, gewuenscht).szenen?.szenen.unveraendert).toEqual(['The Laboratory']);

    // Kennt das Weltabbild keine Signatur (alte Aufrufer), gilt: kein Urteil,
    // keine Aktualisierung — wie bei den Messwerten unvermessener Karten.
    const unbekannt: Weltabbild = { ordner: [], journale: [], szenen: [szeneInWelt] };
    expect(planeImport(unbekannt, gewuenscht).szenen?.szenen.unveraendert).toEqual([
      'The Laboratory',
    ]);
  });

  it('meldet eine Szene als geaendert, wenn sich der Hintergrund aendert', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          ordnerId: null,
          hintergrund: 'pfs/pfs_s08_01/karten/anders.webp',
          ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
        },
      ],
    };

    const plan = planeImport(welt, mitSzenen());
    expect(plan.szenen?.szenen.aktualisiert).toEqual(['The Laboratory']);
  });
});

describe('planeImport — vermessene Karten', () => {
  const vermessen = (): Wunsch =>
    wunsch({
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          breite: 1325,
          hoehe: 1065,
          gitter: 43,
          versatzX: -25,
          versatzY: -27,
        },
      ],
    });

  it('meldet eine Szene als geaendert, wenn die Messwerte abweichen', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          ordnerId: null,
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          gitter: 100,
          versatzX: 0,
          versatzY: 0,
          ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
        },
      ],
    };

    expect(planeImport(welt, vermessen()).szenen?.szenen.aktualisiert).toEqual([
      'The Laboratory',
    ]);
  });

  it('laesst eine unvermessene Karte die Spielleiter-Werte nicht anfechten', () => {
    // Ohne Eintrag in der Tabelle zaehlen Gitter und Versatz nicht als
    // unsere Felder — was der Spielleiter eingestellt hat, bleibt.
    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          ordnerId: null,
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          gitter: 77,
          versatzX: 5,
          versatzY: 5,
          ...flag({ kind: 'scene', scenario: '08-01', season: 8 }),
        },
      ],
    };
    const ohneMessung = wunsch({
      szenen: [
        {
          id: '1111111111111111',
          name: 'The Laboratory',
          hintergrund: 'pfs/pfs_s08_01/karten/the-laboratory.webp',
          breite: 1325,
          hoehe: 1065,
        },
      ],
    });

    expect(planeImport(welt, ohneMessung).szenen?.szenen.unveraendert).toEqual([
      'The Laboratory',
    ]);
  });
});

describe('planeImport — Ordnerfarben', () => {
  it('laesst eine von Hand gewaehlte Farbe des Szenario-Ordners stehen', () => {
    const welt: Weltabbild = {
      ordner: [
        { id: 'S', name: 'Season 8', elternId: null, farbe: '#a04000', ...flag({ kind: 'seasonFolder', season: 8 }) },
        { id: 'X', name: '8-01 Intro to the Year', elternId: 'S', farbe: '#123456', ...flag({ kind: 'scenarioFolder', scenario: '08-01' }) },
      ],
      journale: [],
    };

    expect(planeImport(welt, wunsch()).szenarioOrdner).toEqual({
      art: 'behalten',
      id: 'X',
      name: '8-01 Intro to the Year',
    });
  });

  it('gibt einem neuen Szenario-Ordner die Farbe des vorhandenen Season-Ordners', () => {
    const welt: Weltabbild = {
      ordner: [{ id: 'S', name: 'Season 8', elternId: null, farbe: '#336699' }],
      journale: [],
    };

    expect(planeImport(welt, wunsch()).szenarioOrdner).toMatchObject({
      art: 'anlegen',
      farbe: '#336699',
      elternId: 'S',
    });
  });
});

describe('planeImport — Kreaturen', () => {
  const mitKreaturen = (): Wunsch =>
    wunsch({
      kreaturen: [
        {
          id: '3333333333333333',
          name: 'Twigjack',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.AAAAAAAAAAAAAAAA',
          stufe: 3,
          art: 'creature',
        },
        {
          id: '4444444444444444',
          name: 'Elite Twigjack',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.AAAAAAAAAAAAAAAA',
          anpassung: 'elite',
          stufe: 4,
          art: 'creature',
        },
      ],
    });

  it('plant Ordnerbaum und Kreaturen in einer leeren Welt als neu', () => {
    const plan = planeImport(LEER, mitKreaturen());

    expect(plan.kreaturen?.seasonOrdner.art).toBe('anlegen');
    expect(plan.kreaturen?.szenarioOrdner.art).toBe('anlegen');
    expect(plan.kreaturen?.kreaturen.neu).toEqual(['Twigjack', 'Elite Twigjack']);
  });

  it('plant eine gebaute Gefahr wie eine kopierte Kreatur', () => {
    // Eine szenarioeigene Gefahr hat keine Vorlage, sondern fertige Daten.
    // Fuer den Plan macht das keinen Unterschied — Ordnerbaum, Kennung und
    // das Nie-Loeschen gelten unveraendert.
    const plan = planeImport(
      LEER,
      wunsch({
        kreaturen: [
          {
            id: '5555555555555555',
            name: 'Durstige Ranken',
            daten: { name: 'Durstige Ranken', type: 'hazard', system: {}, items: [] },
            stufe: 1,
            art: 'hazard',
          },
        ],
      }),
    );

    expect(plan.kreaturen?.kreaturen.neu).toEqual(['Durstige Ranken']);
    expect(plan.kreaturen?.szenarioOrdner.art).toBe('anlegen');
  });

  it('bleibt aus, wenn der Wunsch keine Kreaturen enthaelt', () => {
    expect(planeImport(LEER, wunsch()).kreaturen).toBeUndefined();
  });

  it('zaehlt Personen ohne Statblock getrennt von den Kreaturen', () => {
    // Sonst stuenden Tolla und Emrick in der Kreaturenzeile und saehen aus
    // wie etwas, das Werte hat.
    const gemischt = wunsch({
      kreaturen: [
        {
          id: '3333333333333333',
          name: 'Twigjack',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.AAAAAAAAAAAAAAAA',
          stufe: 3,
          art: 'creature',
        },
        {
          id: '6666666666666666',
          name: 'Tolla',
          daten: { name: 'Tolla', type: 'npc' },
          bild: 'pfs/pfs_s08_04/tolla.webp',
          journalSeite: '7777777777777777',
          stufe: 1,
          art: 'nsc',
        },
      ],
    });

    const plan = planeImport(LEER, gemischt).kreaturen?.kreaturen;

    expect(plan?.neu).toEqual(['Twigjack']);
    expect(plan?.nscs.neu).toEqual(['Tolla']);
    // Das Bild eines NSC ist seine Herkunft, keine Zutat — es gehoert nicht
    // in die Zeile ueber die Kreaturenbilder.
    expect(plan?.mitBild).toEqual([]);
  });

  it('meldet nur die neuen Kreaturen, die ihr Bild aus dem Heft bekommen', () => {
    // Ein vorhandener Actor wird nicht angefasst — sein Bild also auch nicht
    // nachgetragen. Sonst versprache die Vorschau etwas, das nicht geschieht.
    const mitBildern = wunsch({
      kreaturen: [
        {
          id: '3333333333333333',
          name: 'Twigjack',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.AAAAAAAAAAAAAAAA',
          bild: 'pfs/pfs_s08_02/twigjack.webp',
          stufe: 3,
          art: 'creature',
        },
        {
          id: '4444444444444444',
          name: 'Elite Twigjack',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.AAAAAAAAAAAAAAAA',
          anpassung: 'elite',
          bild: 'pfs/pfs_s08_02/twigjack.webp',
          stufe: 4,
          art: 'creature',
        },
        {
          id: '5555555555555555',
          name: 'Poppet Mage',
          uuid: 'Compendium.pf2e.pathfinder-monster-core.Actor.BBBBBBBBBBBBBBBB',
          stufe: 1,
          art: 'creature',
        },
      ],
    });

    expect(planeImport(LEER, mitBildern).kreaturen?.kreaturen.mitBild).toEqual([
      'Twigjack',
      'Elite Twigjack',
    ]);

    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      aktoren: [{ id: '3333333333333333', name: 'Twigjack', ordnerId: null }],
    };
    expect(planeImport(welt, mitBildern).kreaturen?.kreaturen.mitBild).toEqual(['Elite Twigjack']);
  });

  it('erkennt vorhandene Kreaturen wieder und meldet Entfallenes ohne Loeschung', () => {
    const welt: Weltabbild = {
      ordner: [],
      journale: [],
      aktoren: [
        { id: '3333333333333333', name: 'Twigjack', ordnerId: null, ...flag({ kind: 'actor', scenario: '08-01', season: 8 }) },
        { id: '9999999999999999', name: 'Alte Kreatur', ordnerId: null, ...flag({ kind: 'actor', scenario: '08-01', season: 8 }) },
        { id: '8888888888888888', name: 'Spielercharakter', ordnerId: null },
      ],
    };

    const plan = planeImport(welt, mitKreaturen());

    expect(plan.kreaturen?.kreaturen.unveraendert).toEqual(['Twigjack']);
    expect(plan.kreaturen?.kreaturen.neu).toEqual(['Elite Twigjack']);
    // Der Spielercharakter ohne Flag geht den Import nichts an.
    expect(plan.kreaturen?.kreaturen.entfallen).toEqual(['Alte Kreatur']);
  });
});
