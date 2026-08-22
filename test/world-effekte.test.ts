import { describe, expect, it } from 'vitest';
import { sammleEffekte } from '../src/pdf/effekte.ts';
import {
  baueEffekt,
  effektName,
  effektOption,
  fuegeEffektVerweiseEin,
  symbolFuer,
} from '../src/world/effekte.ts';
import type { Block } from '../src/pdf/types.ts';
import type { SeitenAbbild } from '../src/world/plan.ts';

// Erfunden, der Satzbauform der Hefte nachgebildet — Wortlaut aus Paizo-
// Produkten steht in diesem Repo nicht (siehe `NOTICE.md`).
const SATZ =
  'If any PC achieves this result, all PCs gain a +1 circumstance bonus on ' +
  'initiative rolls in the combat against the captain on page 8.';

function ausSatz(satz: string) {
  const block: Block = { role: 'check-result', page: 4, column: 0, lines: [], text: satz };
  return sammleEffekte([block])[0]!;
}

describe('effektName', () => {
  it('stellt die Kennung voran und bleibt kurz', () => {
    expect(effektName(ausSatz(SATZ), '08-04')).toBe('PFS 08-04: +1 initiative');
  });

  it('kennzeichnet einen Effekt fuer die Gegner', () => {
    const gegner = ausSatz(
      'This grants the smugglers time, granting all enemies a +2 circumstance bonus to ' +
        'their initiative rolls.',
    );
    expect(effektName(gegner, '08-04')).toBe('PFS 08-04: +2 initiative (enemies)');
  });

  it('nimmt den Wortlaut des Hefts, wenn das Ziel unbekannt ist', () => {
    const unklar = ausSatz(
      'All PCs gain a +1 circumstance bonus to their standing with the harbour guild.',
    );
    expect(effektName(unklar, '08-04')).toContain('their standing with the harbour');
  });
});

describe('symbolFuer', () => {
  it('waehlt ein Symbol je Zweck', () => {
    expect(symbolFuer(ausSatz(SATZ))).toContain('hourglass');
    expect(
      symbolFuer(ausSatz('All PCs gain a +1 status bonus to Perception checks in the fog.')),
    ).toContain('eye');
  });

  it('faellt ohne erkanntes Ziel auf das Standardsymbol zurueck', () => {
    const unklar = ausSatz('All PCs gain a +1 circumstance bonus to their standing.');
    expect(symbolFuer(unklar)).toBe('systems/pf2e/icons/effects/critical-effect.webp');
  });
});

describe('baueEffekt', () => {
  const daten = baueEffekt(ausSatz(SATZ), '08-04', 'Pathfinder Society Scenario #8-04: Titel');
  const system = daten.system as Record<string, unknown>;

  it('baut einen Effekt-Gegenstand mit dem passenden Regelbaustein', () => {
    expect(daten.type).toBe('effect');
    expect(system.rules).toEqual([
      {
        key: 'FlatModifier',
        selector: 'initiative',
        type: 'circumstance',
        value: 1,
        slug: 'pfs-08-04-initiative',
      },
    ]);
  });

  it('haelt den Effekt von den Spielern fern', () => {
    // Zwei Schichten: unsichtbar in der Seitenleiste, maskiert auf dem Blatt.
    expect(daten.ownership).toEqual({ default: 0 });
    expect(system.unidentified).toBe(true);
  });

  it('laeuft unbegrenzt und traegt das Heft als Quelle', () => {
    expect(system.duration).toEqual({
      value: -1,
      unit: 'unlimited',
      sustained: false,
      expiry: null,
    });
    expect((system.publication as { title: string }).title).toBe(
      'Pathfinder Society Scenario #8-04: Titel',
    );
  });

  it('baut ohne erkanntes Ziel keinen Regelbaustein', () => {
    // Ein Bonus am falschen Wert faellt erst am Spieltisch auf.
    const unklar = baueEffekt(
      ausSatz('All PCs gain a +1 circumstance bonus to their standing.'),
      '08-04',
    );
    expect((unklar.system as { rules: unknown[] }).rules).toEqual([]);
  });

  it('macht aus zwei Domaenen zwei Regelbausteine', () => {
    const jagd = baueEffekt(
      ausSatz('All PCs gain a +1 circumstance bonus on all challenges in the chase.'),
      '08-04',
    );
    const regeln = (jagd.system as { rules: { selector: string }[] }).rules;
    expect(regeln.map((r) => r.selector)).toEqual(['skill-check', 'saving-throw']);
  });
});

describe('fuegeEffektVerweiseEin', () => {
  const seite = (inhalt: string): SeitenAbbild => ({
    id: 'a1b2c3d4e5f6a7b8',
    name: 'Seite',
    inhalt,
  });

  it('setzt den Verweis hinter den Satz', () => {
    const seiten = [seite(`<p>Vorher. ${SATZ} Nachher.</p>`)];
    const anzahl = fuegeEffektVerweiseEin(seiten, [
      { satz: SATZ, id: '1234567890abcdef', name: 'PFS 08-04: +1 initiative' },
    ]);

    expect(anzahl).toBe(1);
    expect(seiten[0]!.inhalt).toContain(
      `${SATZ} @UUID[Item.1234567890abcdef]{PFS 08-04: +1 initiative}`,
    );
  });

  it('laesst die Seite in Ruhe, wenn der Satz nicht dasteht', () => {
    // Der Effekt entsteht trotzdem — er ist dann nur nicht verlinkt.
    const seiten = [seite('<p>Etwas ganz anderes.</p>')];
    expect(fuegeEffektVerweiseEin(seiten, [{ satz: SATZ, id: 'x', name: 'y' }])).toBe(0);
    expect(seiten[0]!.inhalt).toBe('<p>Etwas ganz anderes.</p>');
  });

  it('setzt jeden Verweis nur einmal', () => {
    const seiten = [seite(`<p>${SATZ}</p>`), seite(`<p>${SATZ}</p>`)];
    expect(fuegeEffektVerweiseEin(seiten, [{ satz: SATZ, id: 'x', name: 'y' }])).toBe(1);
    expect(seiten[1]!.inhalt).toBe(`<p>${SATZ}</p>`);
  });
});

describe('effektOption', () => {
  const jagd = ausSatz(
    'If any PC achieves this result, all PCs gain a +1 circumstance bonus on all ' +
      'challenges in the chase on page 7.',
  );

  it('grenzt auf die Heftseite ein, wenn das Heft eine nennt', () => {
    expect(jagd.seite).toBe(7);
    expect(effektOption(jagd, '08-04')).toBe('pfs-08-04-page-7');
  });

  it('setzt das predicate an jeden Regelbaustein', () => {
    const regeln = (baueEffekt(jagd, '08-04').system as { rules: { predicate?: string[] }[] })
      .rules;
    expect(regeln).toHaveLength(2);
    expect(regeln.every((r) => r.predicate?.[0] === 'pfs-08-04-page-7')).toBe(true);
  });

  it('grenzt Initiative nicht ein', () => {
    // Eine Initiative wird nicht aus dem Journal gewuerfelt. Ein predicate
    // darauf traefe nie zu — der Bonus wirkte nie.
    const kapitaen = ausSatz(SATZ);
    expect(kapitaen.seite).toBe(8);
    expect(effektOption(kapitaen, '08-04')).toBeUndefined();
  });

  it('grenzt ohne Seitenangabe nicht ein', () => {
    const theater = ausSatz(
      'The PC gains a +1 circumstance bonus to Perception checks while inside the theater.',
    );
    expect(effektOption(theater, '08-03')).toBeUndefined();
  });
});
