import { describe, expect, it } from 'vitest';
import { leseKrankheit } from '../src/pdf/krankheiten.ts';
import {
  fuegeKrankheitVerweiseEin,
  krankheitSeiteHtml,
  krankheitSeitenName,
} from '../src/world/krankheiten.ts';
import type { SeitenAbbild } from '../src/world/plan.ts';

// Erfunden, siehe `krankheiten.test.ts`.
const KRANKHEIT = leseKrankheit(
  'RUSTLUNG DISEASE 4',
  'DISEASE VIRULENT',
  '*Some Rulebook* 12 **Saving Throw** DC 18 Fortitude; **Onset** 1 day; ' +
    '**Stage 1** enfeebled 1 (1 day); **Stage 2** enfeebled 2 and 1d6 poison damage (1 day)',
  11,
)!;

describe('krankheitSeitenName', () => {
  it('nennt Name, Art und Stufe wie die Kopfzeile', () => {
    expect(krankheitSeitenName(KRANKHEIT)).toBe('Rustlung (Disease 4)');
  });
});

describe('krankheitSeiteHtml', () => {
  it('setzt die Plakette und je Abschnitt des Statblocks einen Absatz', () => {
    expect(krankheitSeiteHtml(KRANKHEIT)).toBe(
      [
        '<p><em>disease, virulent</em></p>',
        '<p><em>Some Rulebook</em> 12 <strong>Saving Throw</strong> DC 18 Fortitude</p>',
        '<p><strong>Onset</strong> 1 day</p>',
        '<p><strong>Stage 1</strong> enfeebled 1 (1 day)</p>',
        '<p><strong>Stage 2</strong> enfeebled 2 and 1d6 poison damage (1 day)</p>',
      ].join('\n'),
    );
  });
});

describe('fuegeKrankheitVerweiseEin', () => {
  const seite = (inhalt: string): SeitenAbbild => ({ id: 'x', name: 'Seite', inhalt });
  const UUID = 'JournalEntry.jjjjjjjjjjjjjjjj.JournalEntryPage.pppppppppppppppp';

  it('verlinkt die erste Nennung des Namens, ohne Ruecksicht auf die Schreibung', () => {
    const seiten = [
      seite('<p>Nothing here.</p>'),
      seite('<p>Creatures in the water are exposed to rustlung. Rustlung lingers.</p>'),
    ];
    const gesetzt = fuegeKrankheitVerweiseEin(seiten, [{ satz: 'Rustlung', uuid: UUID }]);

    expect(gesetzt).toBe(1);
    expect(seiten[1]!.inhalt).toBe(
      `<p>Creatures in the water are exposed to @UUID[${UUID}]{rustlung}. Rustlung lingers.</p>`,
    );
  });

  it('laesst Nennungen in Tags, in Verweisen und als Wortteil in Ruhe', () => {
    const seiten = [
      seite('<p class="rustlung">A @UUID[Actor.x]{Rustlung Carrier} and rustlungs.</p>'),
    ];
    expect(fuegeKrankheitVerweiseEin(seiten, [{ satz: 'Rustlung', uuid: UUID }])).toBe(0);
    expect(seiten[0]!.inhalt).toContain('class="rustlung"');
  });
});
