import { describe, expect, it } from 'vitest';
import {
  buildPages,
  detectAdventureRange,
  detectSections,
  escapeHtml,
  foundryId,
  inlineHtml,
  pageName,
  sammleKreaturen,
  seitenKennung,
} from '../src/pdf/journal.ts';
import { titleCase } from '../src/pdf/text.ts';
import { ActorIndex } from '../src/pdf/actors.ts';
import type { Block } from '../src/pdf/types.ts';

function tocEntry(text: string): Block {
  return { role: 'subheading', page: 2, column: 0, text, lines: [] };
}

describe('titleCase', () => {
  it('wandelt Versalien in gemischte Schreibung', () => {
    expect(titleCase('GUIDING CIVILIANS')).toBe('Guiding Civilians');
    expect(titleCase('WHERE ON GOLARION?')).toBe('Where On Golarion?');
  });

  it('laesst normal geschriebene Titel unberuehrt', () => {
    expect(titleCase('Location 1: Cayden’s Keg')).toBe('Location 1: Cayden’s Keg');
  });
});

describe('pageName', () => {
  it('entfernt den Schwierigkeitsgrad, mit und ohne Stufe', () => {
    expect(pageName('D2. Hall of Graves Moderate')).toBe('D2. Hall of Graves');
    expect(pageName('The Sinister Stevedores Low 1')).toBe('The Sinister Stevedores');
  });

  it('behaelt die Ortskennung', () => {
    // Sie ordnet die Begegnungen und verweist auf die Karte; ohne sie steht im
    // Seitenverzeichnis eine Reihe gleichrangiger Namen.
    expect(pageName('A. The Abandoned Book Shop')).toBe('A. The Abandoned Book Shop');
    expect(pageName('A. The Sinister Stevedores Low 1')).toBe('A. The Sinister Stevedores');
  });

  it('behaelt Nummerierungen, die zum Namen gehoeren', () => {
    expect(pageName('Location 1: Cayden’s Keg')).toBe('Location 1: Cayden’s Keg');
    expect(pageName('Event 2: Across the Battlefield')).toBe('Event 2: Across the Battlefield');
  });
});

describe('inlineHtml', () => {
  it('uebersetzt Auszeichnung und schuetzt Sonderzeichen', () => {
    expect(inlineHtml('**Andira** traf <b>')).toBe('<strong>Andira</strong> traf &lt;b&gt;');
    expect(inlineHtml('siehe *Player Core*')).toBe('siehe <em>Player Core</em>');
  });

  it('verwechselt fett nicht mit kursiv', () => {
    expect(inlineHtml('**fett** und *kursiv*')).toBe(
      '<strong>fett</strong> und <em>kursiv</em>',
    );
  });
});

describe('escapeHtml', () => {
  it('schuetzt spitze Klammern und kaufmaennisches Und', () => {
    expect(escapeHtml('Carts & Wheels <hier>')).toBe('Carts &amp; Wheels &lt;hier&gt;');
  });
});

describe('detectAdventureRange', () => {
  it('liest Anfang und Ende aus dem Inhaltsverzeichnis', () => {
    const range = detectAdventureRange([
      tocEntry('Adventure . . . . . . . . . . . 3'),
      tocEntry('Appendix 1: Level 1-2 Encounters. . . . 16'),
      tocEntry('Appendix 3: Game Aids . . . . . 26'),
      tocEntry('Organized Play . . . . . . . . . 30'),
    ]);

    expect(range).toEqual({ from: 3, to: 15 });
  });

  it('gibt nichts zurueck, wenn es kein Verzeichnis gibt', () => {
    expect(detectAdventureRange([tocEntry('Adventure Background')])).toBeUndefined();
  });
});

describe('foundryId', () => {
  it('ist stabil und hat die Laenge einer Foundry-Kennung', () => {
    expect(foundryId('Enough is Enough/0/Adventure Background')).toHaveLength(16);
    expect(foundryId('gleich')).toBe(foundryId('gleich'));
    expect(foundryId('a')).not.toBe(foundryId('b'));
  });
});

describe('buildPages — wiederholte Ueberschriften', () => {
  it('haelt eine Seite bei wiederholtem Titel zusammen', () => {
    const blocks: Block[] = [
      { role: 'subheading', page: 2, column: 0, text: 'Adventure . . . . . 3', lines: [] },
      { role: 'subheading', page: 2, column: 0, text: 'Appendix 1 . . . . . 16', lines: [] },
      { role: 'heading', page: 5, column: 0, level: 1, text: 'A. Battle for the Docks', lines: [] },
      { role: 'body', page: 5, column: 0, text: 'Erster Teil.', lines: [] },
      // Paizo wiederholt die Ueberschrift oben auf der Folgeseite.
      { role: 'heading', page: 6, column: 0, level: 1, text: 'A. Battle for the Docks', lines: [] },
      { role: 'body', page: 6, column: 0, text: 'Zweiter Teil.', lines: [] },
    ];

    const pages = buildPages({ title: 'T', pageCount: 6, blocks, profile: {} as never });

    expect(pages).toHaveLength(1);
    expect(pages[0]!.name).toBe('A. Battle for the Docks');
    expect(pages[0]!.html).toContain('Erster Teil.');
    expect(pages[0]!.html).toContain('Zweiter Teil.');
    // Die Wiederholung bleibt als Ueberschrift im Inhalt erhalten.
    expect(pages[0]!.html).toContain('<h1 class="no-toc">A. Battle for the Docks</h1>');
  });
});

describe('buildPages — Foundry-Auszeichnungen', () => {
  /** Rahmen aus Inhaltsverzeichnis und Ueberschrift, damit eine Seite entsteht. */
  function pageWith(...blocks: Block[]): string {
    const all: Block[] = [
      { role: 'subheading', page: 2, column: 0, text: 'Adventure . . . . . 3', lines: [] },
      { role: 'subheading', page: 2, column: 0, text: 'Appendix 1 . . . . . 16', lines: [] },
      { role: 'heading', page: 5, column: 0, level: 1, text: 'A. Der Kampf', lines: [] },
      ...blocks,
    ];
    return buildPages({ title: 'T', pageCount: 6, blocks: all, profile: {} as never })[0]!.html;
  }

  it('setzt Vorlesetext als blockquote', () => {
    // `blockquote` ist FoundryVTTs eigene Auszeichnung dafuer; die Klasse
    // bleibt fuer die CSS der Abenteuer-Module und das Uebersetzungsmacro.
    const html = pageWith({
      role: 'box',
      page: 5,
      column: 0,
      text: 'Ein Vorlesetext, der die Mindestlaenge eines Kastens locker reisst.',
      lines: [],
    });

    expect(html).toContain('<blockquote class="read-aloud" style=');
    expect(html).toContain('</blockquote>');
    expect(html).not.toContain('<div class="read-aloud">');
    // Der Kasten muss ohne fremdes CSS sitzen — deshalb inline, und mit
    // `currentColor` statt fester Farbe, damit er auch dunkel taugt.
    expect(html).toContain('border-left:3px solid currentColor');
  });

  it('fasst Kreaturenleiste und Verweis als statblock zusammen', () => {
    // Name links, Art und Stufe rechts — dafuer braucht die Ueberschrift zwei
    // Kinder. Der Verweis darunter gehoert in denselben Block.
    const html = pageWith(
      { role: 'box-heading', page: 5, column: 0, text: 'DWARF RIGGER CREATURE 1', lines: [] },
      {
        role: 'body',
        page: 5,
        column: 0,
        text: 'Page 11 **Initiative** Perception +10',
        lines: [],
      },
    );

    expect(html).toContain('<div class="statblock">');
    expect(html).toContain('<span>Dwarf Rigger</span><span> Creature 1</span>');
    expect(html).toContain('justify-content:space-between');
    expect(html).toContain('<strong>Initiative</strong> Perception +10');
    // Der Verweis darf nicht zusaetzlich ausserhalb stehen.
    expect(html.match(/Perception \+10/g)).toHaveLength(1);
  });

  it('nimmt auch einen Verweis ohne Initiative mit', () => {
    // Eine Gefahr wuerfelt keine Initiative, ihr Verweis nennt nur die Seite.
    // Fest ist allein der Anfang `Page <Zahl>`.
    const html = pageWith(
      { role: 'box-heading', page: 5, column: 0, text: 'MINOR SHARD DUST HAZARD 1', lines: [] },
      { role: 'body', page: 5, column: 0, text: 'Page 31, art on page 47', lines: [] },
    );

    expect(html).toContain('<span>Minor Shard Dust</span><span> Hazard 1</span>');
    expect(html.indexOf('Page 31')).toBeLessThan(html.lastIndexOf('</div>'));
  });

  it('laesst einen fremden Absatz unter der Leiste stehen', () => {
    // Ohne `**Initiative**` ist es kein Verweis, sondern gewoehnlicher Text.
    const html = pageWith(
      { role: 'box-heading', page: 5, column: 0, text: 'DWARF RIGGER CREATURE 1', lines: [] },
      { role: 'body', page: 5, column: 0, text: 'Die Zwerge warten am Kai.', lines: [] },
    );

    expect(html).toContain('<div class="statblock">');
    expect(html).toContain('<p>Die Zwerge warten am Kai.</p>');
    expect(html.indexOf('</div>')).toBeLessThan(html.indexOf('Die Zwerge'));
  });
});

describe('detectSections', () => {
  it('liest alle Abschnitte mit ihren Grenzen', () => {
    // Das Verzeichnis nennt nur den Anfang; das Ende ist die Seite vor dem
    // naechsten Eintrag. Der letzte Abschnitt hat keins.
    expect(
      detectSections([
        tocEntry('Adventure . . . . . . . . . . . 3'),
        tocEntry('Appendix: Statistics . . . . . . 11'),
        tocEntry('Appendix: Game Aids . . . . . . 12'),
        tocEntry('Organized Play . . . . . . . . . 15'),
      ]),
    ).toEqual([
      { title: 'Adventure', from: 3, to: 10 },
      { title: 'Appendix: Statistics', from: 11, to: 11 },
      { title: 'Appendix: Game Aids', from: 12, to: 14 },
      { title: 'Organized Play', from: 15, to: Number.POSITIVE_INFINITY },
    ]);
  });

  it('gibt nichts zurueck, wenn es kein Verzeichnis gibt', () => {
    expect(detectSections([tocEntry('Adventure Background')])).toEqual([]);
  });
});

describe('sammleKreaturen', () => {
  const eintrag = (name: string, id: string, level: number, kind: 'creature' | 'hazard' = 'creature') =>
    ({ name, pack: 'pf2e.pathfinder-monster-core', id, level, kind }) as const;

  const index = new ActorIndex([
    eintrag('Twigjack', 'AAAAAAAAAAAAAAAA', 3),
    eintrag('Wight', 'BBBBBBBBBBBBBBBB', 3),
    eintrag('Scythe Blades', 'CCCCCCCCCCCCCCCC', 4, 'hazard'),
  ]);

  const zeile = (text: string): Block =>
    ({ role: 'subheading', page: 5, column: 0, text, lines: [] }) as Block;

  const statblock = (text: string): Block =>
    ({ role: 'statblock', page: 5, column: 0, text, lines: [] }) as Block;
  const traits = (): Block =>
    ({ role: 'traits', page: 5, column: 0, text: 'MEDIUM HUMAN HUMANOID', lines: [] }) as Block;

  it('sammelt jede Fassung genau einmal, mit Stufenprobe', () => {
    const blocks = [
      // Versalien wie im PDF; die Titelschreibung uebernimmt der Sammler.
      zeile('TWIGJACK CREATURE 3'),
      zeile('TWIGJACK (2) CREATURE 3'),
      zeile('ELITE TWIGJACK CREATURE 4'),
      zeile('SCYTHE BLADES HAZARD 4'),
      zeile('Fliesstext, der Twigjack erwaehnt'),
    ];

    const { kreaturen } = sammleKreaturen(blocks, index);
    expect(kreaturen.map((k) => [k.name, k.anpassung ?? ''])).toEqual([
      ['Twigjack', ''],
      ['Elite Twigjack', 'elite'],
      ['Scythe Blades', ''],
    ]);
  });

  it('loest eine Variante ueber die Quellenzeile auf', () => {
    // `Captain Ashfell Grimme Creature 2` steht in keinem Kompendium; die
    // Quellenzeile nennt den Piraten als Vorlage. Der Actor bekommt den
    // Namen des Statblocks.
    const blocks = [
      zeile('CAPTAIN ASHFELL GRIMME CREATURE 2'),
      traits(),
      statblock('Variant pirate (*Pathfinder NPC Core* 147) **Perception** +6'),
    ];
    const kreaturIndex = new ActorIndex([
      eintrag('Pirate', 'DDDDDDDDDDDDDDDD', 1),
    ]);

    const { kreaturen, ohneVorlage } = sammleKreaturen(blocks, kreaturIndex);
    expect(kreaturen).toHaveLength(1);
    expect(kreaturen[0]).toMatchObject({
      name: 'Captain Ashfell Grimme',
      variante: 'Variant pirate',
      stufe: 2,
      art: 'creature',
    });
    expect(kreaturen[0]!.entry.name).toBe('Pirate');
    expect(ohneVorlage).toEqual([]);
  });

  it('loest den Kurzverweis der Begegnungsliste auf — samt Anpassung', () => {
    // Burr in 8-02: die Liste sagt `Elite twigjack, page 12`. Der Actor
    // heisst Burr, darunter steckt der Twigjack, elite gestellt.
    const blocks = [
      zeile('BURR CREATURE 4'),
      { role: 'box', page: 5, column: 0, text: 'Elite twigjack, page 12 **Initiative** Stealth +13', lines: [] } as Block,
    ];
    const kreaturIndex = new ActorIndex([eintrag('Twigjack', 'EEEEEEEEEEEEEEEE', 3)]);

    const { kreaturen } = sammleKreaturen(blocks, kreaturIndex);
    expect(kreaturen).toHaveLength(1);
    expect(kreaturen[0]).toMatchObject({ name: 'Burr', anpassung: 'elite', stufe: 4 });
    expect(kreaturen[0]!.entry.name).toBe('Twigjack');
  });

  it('meldet einen Listeneintrag nicht, wenn der Appendix ihn aufloest', () => {
    // In der Liste steht nur `Page 12`; die Werte kommen im Appendix.
    const blocks = [
      zeile('BURR CREATURE 4'),
      { role: 'body', page: 5, column: 0, text: 'Page 12 **Initiative** Stealth +13', lines: [] } as Block,
      zeile('BURR CREATURE 4'),
      traits(),
      statblock('Elite twigjack (*Pathfinder Monster Core* 6, 332) **Perception** +11'),
    ];
    const kreaturIndex = new ActorIndex([eintrag('Twigjack', 'EEEEEEEEEEEEEEEE', 3)]);

    const { kreaturen, ohneVorlage } = sammleKreaturen(blocks, kreaturIndex);
    expect(kreaturen.map((k) => k.name)).toEqual(['Burr']);
    expect(ohneVorlage).toEqual([]);
  });

  it('meldet einen Statblock ohne Vorlage, ohne ihn zu erfinden', () => {
    const blocks = [
      zeile('EINDEUTIG EIGENES WESEN CREATURE 7'),
      traits(),
      statblock('*Pathfinder Adventure Path #200* 12 **Perception** +15'),
    ];

    const { kreaturen, ohneVorlage } = sammleKreaturen(blocks, index);
    expect(kreaturen).toEqual([]);
    expect(ohneVorlage).toEqual([
      {
        name: 'Eindeutig Eigenes Wesen',
        art: 'creature',
        statblock: expect.anything(),
        buch: 'Pathfinder Adventure Path #200',
      },
    ]);
  });

  it('meldet eine Gefahr auch dann, wenn ihr Block keine Statblock-Rolle traegt', () => {
    // Paizo setzt den Anhangsblock einer Gefahr mal als `statblock`, mal als
    // `box`, mal als `check-result`. Die alte Probe hing an dieser Rolle —
    // von den fuenf Gefahren der Season 8 kam so nur eine in der Vorschau an.
    // Massgeblich ist stattdessen die Merkmalsplakette hinter der Kopfzeile.
    const blocks = [
      zeile('DURSTIGE RANKEN HAZARD 1'),
      { role: 'traits', page: 5, column: 0, text: 'ENVIRONMENTAL HAZARD', lines: [] } as Block,
      { role: 'box', page: 5, column: 0, text: '**Stealth** DC 15 (trained)', lines: [] } as Block,
    ];

    const { kreaturen, ohneVorlage } = sammleKreaturen(blocks, index);
    expect(kreaturen).toEqual([]);
    // Die Gefahr bringt ihren Statblock mit — nur damit laesst sich spaeter
    // etwas bauen.
    expect(ohneVorlage).toHaveLength(1);
    expect(ohneVorlage[0]).toMatchObject({ name: 'Durstige Ranken', art: 'hazard' });
    expect(ohneVorlage[0]?.statblock?.stealth).toBe('DC 15 (trained)');
  });

  it('haelt eine blosse Erwaehnung ohne Statblock fuer keine Kreatur', () => {
    const { kreaturen, ohneVorlage } = sammleKreaturen(
      [zeile('UNBEKANNTES WESEN CREATURE 9'), zeile('Adventure Background')],
      index,
    );
    expect(kreaturen).toEqual([]);
    expect(ohneVorlage).toEqual([]);
  });
});

describe('seitenKennung', () => {
  it('bleibt stabil, wenn eine Seite dazukommt', () => {
    // Die alte Ableitung ueber die Position verschob beim Einfuegen alles
    // dahinter; am Namen haengt die Kennung nur noch an der Seite selbst.
    const vorher = ['Intro', 'Getting Started', 'Conclusion'];
    const nachher = ['Intro', 'Neue Seite', 'Getting Started', 'Conclusion'];
    const kennungen = (namen: string[]): Map<string, string> => {
      const zaehler = new Map<string, number>();
      const ergebnis = new Map<string, string>();
      for (const name of namen) {
        const nth = zaehler.get(name) ?? 0;
        zaehler.set(name, nth + 1);
        ergebnis.set(`${name}#${nth}`, seitenKennung('Titel', name, nth));
      }
      return ergebnis;
    };

    const alt = kennungen(vorher);
    const neu = kennungen(nachher);
    for (const [schluessel, kennung] of alt) {
      expect(neu.get(schluessel)).toBe(kennung);
    }
  });

  it('zaehlt gleichnamige Seiten getrennt', () => {
    expect(seitenKennung('Titel', 'Hero Points', 0)).not.toBe(
      seitenKennung('Titel', 'Hero Points', 1),
    );
  });
});
