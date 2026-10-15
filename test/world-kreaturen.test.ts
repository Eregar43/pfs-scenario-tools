import { describe, expect, it } from 'vitest';
import { leseStatblock } from '../src/pdf/statblock.ts';
import type { OhneVorlage } from '../src/pdf/journal.ts';
import { baueKreatur, leseSinn, wirdAlsKreaturGebaut } from '../src/world/kreaturen.ts';
import { bildFuerKreatur, namensformen } from '../src/world/bilder.ts';
import { sammleNscs } from '../src/world/nscs.ts';

/**
 * Die Kreaturen hier sind **erfunden**; Paizo-Text gehoert nicht ins Repo. Das
 * Schema dagegen ist echt — abgelesen an `_reference/pf2e/packs/pf2e/
 * pathfinder-monster-core` (Wight, Wraith) und an einer Truppe aus dem
 * Battlecry-Bestiarium. Geeicht wurde der Bau an den zwei Kreaturen ohne
 * Vorlage aus 8-07.
 */

const werke = {
  kreaturMerkmale: new Set(['undead', 'unholy', 'wight', 'troop', 'zombie', 'mindless']),
  sinne: new Set(['darkvision', 'lifesense', 'tremorsense']),
  sprachen: new Set(['common', 'necril']),
  fertigkeiten: new Set(['athletics', 'intimidation', 'religion']),
  immunitaeten: new Set(['bleed', 'death-effects', 'poison']),
  schwaechen: new Set(['vitality', 'area-damage']),
  resistenzen: new Set(['cold']),
  aktionsMerkmale: new Set(['divine', 'curse']),
  angriffsMerkmale: new Set(['agile', 'magical']),
};

const GRUFTRICHTER = [
  '**Perception** +15; darkvision, lifesense 30 feet, glimmersight',
  '**Languages** Common, Necril, Gruftisch',
  '**Skills** Athletics +14 (+16 to Grapple), Intimidation +12, Grave Lore +9, Gaukelei +3',
  '**Str** +4, **Dex** +1, **Con** +4, **Int** +0, **Wis** +3, **Cha** +2',
  '**Items** rostiger Hammer, Amtskette',
  '**AC** 26; **Fort** +18, **Ref** +12, **Will** +15',
  '**HP** 130 (void healing); **Immunities** bleed, death effects, poison',
  '**Weaknesses** vitality 10; **Resistances** cold 5, all damage 3 (except force)',
  '**Speed** 25 feet, fly 20 feet, troop movement',
  '**Melee** [one-action] *hammer* +17 (magical), **Damage** 2d8+6 bludgeoning plus Urteil',
  '**Melee** [one-action] claw +17 (agile), **Damage** 2d6+6 slashing',
  '**Urteil** (curse, divine) Der Gruftrichter verurteilt.',
  '**Richter Devotion Spells** 1 Focus Point, DC 22',
].join(' ');

const bau = (plakette = 'UNIQUE MEDIUM UNDEAD UNHOLY WIGHT') =>
  baueKreatur(leseStatblock('GRUFTRICHTER CREATURE 7', plakette, GRUFTRICHTER)!, werke, 'Heft');

const system = (daten: Record<string, unknown>) => daten['system'] as Record<string, any>;

describe('baueKreatur', () => {
  it('legt einen NPC mit Stufe, Werten und Quelle an', () => {
    const { daten } = bau();
    const s = system(daten);

    expect(daten['type']).toBe('npc');
    expect(daten['name']).toBe('Gruftrichter');
    expect(s.details.level.value).toBe(7);
    expect(s.details.publication.title).toBe('Heft');
    expect(s.attributes.ac.value).toBe(26);
    expect(s.attributes.hp).toMatchObject({ max: 130, value: 130, details: 'void healing' });
    expect(s.saves.fortitude.value).toBe(18);
    expect(s.abilities.wis.mod).toBe(3);
    expect(s.perception.mod).toBe(15);
    expect(s.initiative.statistic).toBe('perception');
  });

  it('trennt Groesse und Seltenheit von den Merkmalen', () => {
    const s = system(bau().daten);
    expect(s.traits).toEqual({
      rarity: 'unique',
      size: { value: 'med' },
      value: ['undead', 'unholy', 'wight'],
    });
    expect(system(bau('GARGANTUAN MINDLESS TROOP UNDEAD ZOMBIE').daten).traits.size.value).toBe(
      'grg',
    );
  });

  it('liest Sinne mit Reichweite und meldet unbekannte', () => {
    const { daten, ungenutzt } = bau();
    expect(system(daten).perception.senses).toEqual([
      { type: 'darkvision' },
      { type: 'lifesense', range: 30 },
    ]);
    expect(ungenutzt).toContain('Sinn: glimmersight');
    expect(ungenutzt).toContain('Sprache: gruftisch');
  });

  it('schreibt Fertigkeiten nach system.skills und Wissen als Item', () => {
    const { daten, ungenutzt } = bau();
    expect(system(daten).skills).toEqual({
      athletics: { base: 14, note: '+16 to Grapple' },
      intimidation: { base: 12 },
    });
    const items = daten['items'] as Array<Record<string, any>>;
    const wissen = items.find((item) => item['type'] === 'lore');
    expect(wissen).toMatchObject({ name: 'Grave Lore', system: { mod: { value: 9 } } });
    expect(ungenutzt).toContain('Fertigkeit: Gaukelei');
  });

  it('teilt das Tempo in Gehen, weitere Arten und Zusatz', () => {
    expect(system(bau().daten).attributes.speed).toEqual({
      value: 25,
      otherSpeeds: [{ type: 'fly', value: 20 }],
      details: 'troop movement',
    });
  });

  it('schreibt Schwaechen und Resistenzen, meldet eine mit Ausnahme', () => {
    const { daten, ungenutzt } = bau();
    const attribute = system(daten).attributes;
    expect(attribute.weaknesses).toEqual([{ type: 'vitality', value: 10, exceptions: [] }]);
    expect(attribute.resistances).toEqual([
      { type: 'cold', value: 5, exceptions: [], doubleVs: [] },
    ]);
    expect(attribute.immunities.map((i: { type: string }) => i.type)).toEqual([
      'bleed',
      'death-effects',
      'poison',
    ]);
    expect(ungenutzt.some((punkt) => punkt.startsWith('Resistenz: all damage 3'))).toBe(true);
  });

  it('baut Angriffe und Faehigkeiten wie bei den Gefahren', () => {
    const items = bau().daten['items'] as Array<Record<string, any>>;
    const angriffe = items.filter((item) => item['type'] === 'melee');
    expect(angriffe.map((a) => [a['name'], a['system'].bonus.value])).toEqual([
      ['hammer', 17],
      ['claw', 17],
    ]);
    const urteil = items.find((item) => item['name'] === 'Urteil');
    expect(urteil?.['system'].traits.value).toEqual(['curse', 'divine']);
  });

  it('meldet Gegenstaende und Zauber, statt sie zu erfinden', () => {
    const { ungenutzt } = bau();
    expect(ungenutzt).toContain('Gegenstaende: rostiger Hammer, Amtskette');
    expect(ungenutzt).toContain('Zauber nur als Text: Richter Devotion Spells');
  });
});

describe('leseSinn', () => {
  it('nimmt Genauigkeit und Reichweite auseinander', () => {
    expect(leseSinn('tremorsense (imprecise) 30 feet')).toEqual({
      type: 'tremorsense',
      acuity: 'imprecise',
      range: 30,
    });
    expect(leseSinn('low-light vision')).toEqual({ type: 'low-light-vision' });
  });
});

describe('wirdAlsKreaturGebaut', () => {
  const statblock = leseStatblock('GRUFTRICHTER CREATURE 7', 'MEDIUM UNDEAD', GRUFTRICHTER)!;

  it('baut nur Kreaturen mit Statblock und ohne Quellenzeile', () => {
    const eintrag: OhneVorlage = { name: 'Gruftrichter', art: 'creature', statblock };
    expect(wirdAlsKreaturGebaut(eintrag)).toBe(true);
    expect(wirdAlsKreaturGebaut({ ...eintrag, art: 'hazard' })).toBe(false);
    expect(wirdAlsKreaturGebaut({ name: 'Gruftrichter', art: 'creature' })).toBe(false);
  });

  it('laesst eine Kreatur mit Buch der Kopie', () => {
    // Die Vorlage gibt es — sie fehlt nur in dieser Welt.
    const eintrag: OhneVorlage = {
      name: 'Gruftrichter',
      art: 'creature',
      statblock,
      buch: 'Starfinder Erfundenes Bestiarium',
    };
    expect(wirdAlsKreaturGebaut(eintrag)).toBe(false);
  });
});

describe('Kurzformen im Namensvergleich', () => {
  const bilder = [{ name: 'GWV Ortsgruppe 7', pfad: 'gwv.webp', file: 'gwv', anhang: true }];

  it('kennt die Abkuerzung aus zwei oder mehr grossgeschriebenen Woertern', () => {
    expect(namensformen('Graue Wandelnde Vereinigung Ortsgruppe 7')).toContain('gwv ortsgruppe 7');
    expect(namensformen('der stille Wicht')).toEqual(['der stille wicht']);
  });

  it('findet das Portraet und legt keinen NSC dazu an', () => {
    const name = 'Graue Wandelnde Vereinigung Ortsgruppe 7';
    expect(bildFuerKreatur(name, bilder)).toBe('gwv.webp');
    expect(sammleNscs(bilder, [name])).toEqual([]);
  });
});
