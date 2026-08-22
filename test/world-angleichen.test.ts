import { describe, expect, it } from 'vitest';
import { leseStatblock } from '../src/pdf/statblock.ts';
import { gleicheAn } from '../src/world/angleichen.ts';
import { abbildAusActor } from '../src/world/statblock-abgleich.ts';

/**
 * Kreatur und Vorlage sind **erfunden**; Paizo-Text gehoert nicht ins Repo.
 * Die Feldnamen der Actordaten stammen aus den echten Dateien unter
 * `_reference/pf2e`.
 *
 * Geeicht wurde der Angleich an den elf Kreaturen der Season 8: neun stimmen
 * danach vollstaendig mit ihrem Statblock ueberein, zwei bleiben absichtlich
 * stehen — beides Satzfehler des Hefts. Genau die stehen hier als Test.
 */

const werke = {
  merkmale: new Set(['plant', 'humanoid', 'fey', 'dwarf', 'human']),
  sinne: new Set(['darkvision', 'low-light-vision']),
  sprachen: new Set(['common', 'sylvan', 'dwarven']),
  angriffsMerkmale: new Set(['agile', 'finesse', 'magical', 'parry', 'versatile-b', 'unarmed']),
};

/** Die Vorlage, wie `toObject()` sie liefert. */
const VORLAGE = {
  name: 'Mooswicht',
  type: 'npc',
  system: {
    abilities: { str: { mod: 3 }, dex: { mod: 2 }, con: { mod: 1 }, int: { mod: 0 }, wis: { mod: 1 }, cha: { mod: -1 } },
    attributes: { ac: { value: 18 }, hp: { max: 30, value: 30 }, speed: { value: 30, otherSpeeds: [] } },
    details: { languages: { value: ['common'] }, level: { value: 2 } },
    perception: { mod: 8, senses: [] },
    saves: { fortitude: { value: 9 }, reflex: { value: 7 }, will: { value: 5 } },
    skills: { acrobatics: { base: 6 }, athletics: { base: 9 } },
    traits: { rarity: 'common', size: { value: 'med' }, value: ['human', 'humanoid'] },
  },
  items: [
    { _id: 'aaaa', type: 'lore', name: 'Moos Lore', system: { mod: { value: 4 } } },
    {
      _id: 'bbbb',
      type: 'melee',
      name: 'Fist',
      system: {
        bonus: { value: 11 },
        damageRolls: { x: { damage: '1d6+4', damageType: 'bludgeoning' } },
        range: null,
        traits: { value: ['agile', 'finesse', 'unarmed'] },
        attackEffects: { value: ['giftlein'] },
      },
    },
  ],
};

/** Derselbe Wicht, wie das Heft ihn druckt — als Zwerg, mit Klaue. */
const HEFT = [
  '**Perception** +8; darkvision **Languages** Common, Dwarven',
  '**Skills** Acrobatics +6, Athletics +9, Moos Lore +4',
  '**Str** +3, **Dex** +2, **Con** +1, **Int** +0, **Wis** +1, **Cha** –1',
  '**AC** 18; **Fort** +9, **Ref** +7, **Will** +5 **HP** 30',
  '**Speed** 25 feet',
  '**Melee** [one-action] claw +11 (agile, finesse, unarmed), **Damage** 1d6+4 slashing',
].join(' ');

const angleich = (rumpf = HEFT, plakette = 'MEDIUM DWARF HUMANOID', optionen = {}) =>
  gleicheAn(VORLAGE, leseStatblock('MOOSWICHT CREATURE 2', plakette, rumpf)!, abbildAusActor(VORLAGE), {
    werke,
    ...optionen,
  });

describe('gleicheAn', () => {
  const { daten, ungenutzt } = angleich();
  const system = daten['system'] as Record<string, any>;
  const items = daten['items'] as Array<Record<string, any>>;

  it('laesst die uebergebenen Daten unangetastet', () => {
    // Der Aufrufer haelt dieselbe Vorlage womoeglich noch fuer eine zweite
    // Kreatur in der Hand.
    expect(VORLAGE.system.traits.value).toEqual(['human', 'humanoid']);
    expect(VORLAGE.system.attributes.speed.value).toBe(30);
  });

  it('setzt Merkmale, Groesse und Seltenheit aus der Plakette', () => {
    expect(system['traits'].value).toEqual(['dwarf', 'humanoid']);
    expect(system['traits'].size.value).toBe('med');
    expect(system['traits'].rarity).toBe('common');
  });

  it('setzt die Sinne', () => {
    expect(system['perception'].senses).toEqual([{ type: 'darkvision' }]);
  });

  it('setzt die Sprachen', () => {
    expect(system['details'].languages.value).toEqual(['common', 'dwarven']);
  });

  it('setzt die Bewegungsrate', () => {
    expect(system['attributes'].speed.value).toBe(25);
  });

  it('ersetzt einen Angriff, den das Heft anders nennt', () => {
    // Aus der Faust wird die Klaue — genau der Fall des Captain Ashfell.
    expect(items.filter((i) => i['type'] === 'melee').map((i) => i['name'])).toEqual(['claw']);
    const klaue = items.find((i) => i['name'] === 'claw')!;
    expect(Object.values(klaue['system'].damageRolls)).toEqual([
      { damage: '1d6+4', damageType: 'slashing' },
    ]);
  });

  it('laesst fremde Items in Ruhe', () => {
    expect(items.find((i) => i['type'] === 'lore')?.['name']).toBe('Moos Lore');
  });

  it('meldet nichts, wo alles aufgeht', () => {
    expect(ungenutzt).toEqual([]);
  });

  it('behaelt die Zusaetze eines gepaarten Angriffs', () => {
    // `attackEffects` verweist im Kompendium etwa auf ein Gift; im Heft kann
    // so etwas gar nicht stehen. Ein gepaarter Angriff behaelt sein Item.
    const gleich = angleich(HEFT.replace('claw', 'fist'));
    const faust = (gleich.daten['items'] as any[]).find((i) => i['name'] === 'Fist')!;
    expect(faust['system'].attackEffects.value).toEqual(['giftlein']);
    expect(Object.values(faust['system'].damageRolls)).toEqual([
      { damage: '1d6+4', damageType: 'slashing' },
    ]);
  });

  it('ersetzt die Merkmale eines Angriffs nur, wenn die Zeile ganz lesbar war', () => {
    // Bei den Animated Brooms (8-01) fehlt im Heft ein Komma: `finesse
    // magical` wird ein unbekanntes Merkmal. Die Kopie darf darueber nicht
    // `finesse` und `magical` verlieren, die sie richtig traegt.
    const gleich = angleich(HEFT.replace('claw +11 (agile, finesse, unarmed)', 'fist +11 (agile, finesse unarmed)'));
    const faust = (gleich.daten['items'] as any[]).find((i) => i['name'] === 'Fist')!;
    expect(faust['system'].traits.value).toEqual(['agile', 'finesse', 'unarmed']);
    expect(gleich.ungenutzt).toContain('Angriffsmerkmal fist: finesse-unarmed');
  });

  it('setzt eine Wissensfertigkeit an ihrem Item, nicht in der Fertigkeitsliste', () => {
    // PF2e fuehrt normale Fertigkeiten in `system.skills`, Wissensfertigkeiten
    // dagegen als eigenes Item vom Typ `lore`. Wer nur in die Liste schreibt,
    // legt einen Eintrag an, den das System nie liest.
    const gleich = angleich(HEFT.replace('Moos Lore +4', 'Moos Lore +7'));
    const system = gleich.daten['system'] as any;
    const lore = (gleich.daten['items'] as any[]).find((i) => i['type'] === 'lore')!;

    expect(lore['system'].mod.value).toBe(7);
    expect(system.skills['moos-lore']).toBeUndefined();
    expect(gleich.ungenutzt).toEqual([]);
  });

  it('laesst das Lore-Item in Ruhe, wo der Wert schon stimmt', () => {
    const lore = (angleich().daten['items'] as any[]).find((i) => i['type'] === 'lore')!;
    expect(lore['system'].mod.value).toBe(4);
  });

  it('meldet eine Wissensfertigkeit, die die Vorlage gar nicht hat', () => {
    // Sie zu bauen brauchte eine Ausbildungsstufe, die im Heft nicht steht.
    const gleich = angleich(HEFT.replace('Moos Lore +4', 'Moos Lore +4, Zwergen Lore +5'));
    expect(gleich.ungenutzt).toContain('Fertigkeit: Zwergen Lore');
  });

  it('meldet einen Sinn, den das System nicht kennt', () => {
    const gleich = angleich(HEFT.replace('+8; darkvision', '+8; moossicht'));
    expect((gleich.daten['system'] as any).perception.senses).toEqual([]);
    expect(gleich.ungenutzt).toContain('Sinn: moossicht');
  });
});

describe('gleicheAn bei Elite und Schwach', () => {
  const optionen = { anpassung: 'elite' as const };

  it('laesst alle Zahlen in Ruhe', () => {
    // Die rechnet `applyAdjustment` nach dem Anlegen selbst nach; hier gesetzt
    // waeren sie doppelt angepasst.
    const geaendert = HEFT.replace('**AC** 18', '**AC** 20').replace('**HP** 30', '**HP** 45');
    const system = angleich(geaendert, 'MEDIUM DWARF HUMANOID', optionen).daten['system'] as any;
    expect(system.attributes.ac.value).toBe(18);
    expect(system.attributes.hp.max).toBe(30);
  });

  it('setzt Merkmale, Sinne, Sprachen und Tempo trotzdem', () => {
    // Die faellt die Anpassung nicht an, und beim Dwarf Rigger ist das Tempo
    // gerade der Unterschied.
    const system = angleich(HEFT, 'MEDIUM DWARF HUMANOID', optionen).daten['system'] as any;
    expect(system.traits.value).toEqual(['dwarf', 'humanoid']);
    expect(system.attributes.speed.value).toBe(25);
  });

  it('legt keinen Angriff an und entfernt keinen', () => {
    // Die gedruckte Zeile traegt bereits angepasste Werte; daraus gebaut waere
    // der Angriff doppelt angepasst. Und ein Satzfehler des Hefts duerfte
    // keinen Angriff ersatzlos verschwinden lassen.
    const { daten, ungenutzt } = angleich(HEFT, 'MEDIUM DWARF HUMANOID', optionen);
    const namen = (daten['items'] as any[]).filter((i) => i['type'] === 'melee').map((i) => i['name']);
    expect(namen).toEqual(['Fist']);
    expect(ungenutzt).toContain('Angriff claw');
  });
});
