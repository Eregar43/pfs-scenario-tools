import { describe, expect, it } from 'vitest';
import { leseKrankheit } from '../src/pdf/krankheiten.ts';
import {
  baueKrankheit,
  fuegeKrankheitVerweiseEin,
  krankheitName,
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

describe('krankheitName', () => {
  it('stellt die Kennung voran und nennt Art und Stufe', () => {
    expect(krankheitName(KRANKHEIT, '08-06')).toBe('PFS 08-06: Rustlung (Disease 4)');
  });
});

describe('baueKrankheit', () => {
  const daten = baueKrankheit(KRANKHEIT, '08-06', 'Some Scenario');
  const system = daten.system as Record<string, unknown>;

  it('ist eine Affliction mit Rettungswurf, Onset und Stufen im Schema des Systems', () => {
    expect(daten.type).toBe('affliction');
    expect(daten.ownership).toEqual({ default: 0 });
    expect(system.level).toEqual({ value: 4 });
    expect(system.save).toEqual({ type: 'fortitude', value: 18 });
    expect(system.onset).toEqual({ value: 1, unit: 'days' });
    expect(system.status).toEqual({ onset: true, stage: 1, progress: 0 });
    expect(system.duration).toEqual({ value: -1, unit: 'unlimited', expiry: null });
    expect(system.stages).toEqual([
      {
        damage: [],
        conditions: [{ slug: 'enfeebled', value: 1, linked: true }],
        effects: [],
        duration: { value: 1, unit: 'days' },
      },
      {
        damage: [{ formula: '1d6', damageType: 'poison', category: null }],
        conditions: [{ slug: 'enfeebled', value: 2, linked: true }],
        effects: [],
        duration: { value: 1, unit: 'days' },
      },
    ]);
  });

  it('traegt disease und virulent als Schlagwoerter, nicht als Effekt-Merkmale', () => {
    // `effectTraits` des Systems kennt beide nicht; ein LaxArrayField wuerde
    // sie stillschweigend verwerfen.
    expect(system.traits).toEqual({ value: [], otherTags: ['disease', 'virulent'] });
  });

  it('schreibt den Statblock in die Beschreibung', () => {
    const beschreibung = (system.description as { value: string }).value;
    expect(beschreibung).toContain('<em>disease, virulent</em>');
    expect(beschreibung).toContain('<strong>Saving Throw</strong> DC 18 Fortitude');
  });
});

describe('fuegeKrankheitVerweiseEin', () => {
  const seite = (inhalt: string): SeitenAbbild => ({ id: 'x', name: 'Seite', inhalt });

  it('verlinkt die erste Nennung des Namens, ohne Ruecksicht auf die Schreibung', () => {
    const seiten = [
      seite('<p>Nothing here.</p>'),
      seite('<p>Creatures in the water are exposed to rustlung. Rustlung lingers.</p>'),
    ];
    const gesetzt = fuegeKrankheitVerweiseEin(seiten, [
      { satz: 'Rustlung', id: 'abc', name: 'PFS 08-06: Rustlung (Disease 4)' },
    ]);

    expect(gesetzt).toBe(1);
    expect(seiten[1]!.inhalt).toBe(
      '<p>Creatures in the water are exposed to @UUID[Item.abc]{rustlung}. Rustlung lingers.</p>',
    );
  });

  it('laesst Nennungen in Tags, in Verweisen und als Wortteil in Ruhe', () => {
    const seiten = [
      seite('<p class="rustlung">A @UUID[Actor.x]{Rustlung Carrier} and rustlungs.</p>'),
    ];
    expect(
      fuegeKrankheitVerweiseEin(seiten, [{ satz: 'Rustlung', id: 'abc', name: 'n' }]),
    ).toBe(0);
    expect(seiten[0]!.inhalt).toContain('class="rustlung"');
  });
});
