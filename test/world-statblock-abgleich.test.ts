import { describe, expect, it } from 'vitest';
import { leseStatblock } from '../src/pdf/statblock.ts';
import {
  abbildAusActor,
  normalisiere,
  vergleiche,
  type Vorlagenabbild,
} from '../src/world/statblock-abgleich.ts';

/**
 * Kreatur und Vorlage sind **erfunden**; Paizo-Text gehoert nicht ins Repo.
 * Die Feldnamen der Actordaten stammen dagegen aus den echten Dateien unter
 * `_reference/pf2e` — sie sind der eigentliche Prueffall.
 *
 * Geeicht wurde der Abgleich an den elf Kreaturen der Season 8 gegen ihre
 * Kompendiumseintraege. Jeder Fehlalarm, der dabei auffiel, steht hier als
 * Test: Groessenschluessel, Apostroph, `unarmed`, Elite, Kampfart.
 */

/** Ein PF2e-Actor in der Form, die `toObject()` liefert. */
const MOOSWICHT_ACTOR = {
  name: 'Mooswicht',
  system: {
    abilities: { str: { mod: 3 }, dex: { mod: 2 }, con: { mod: 1 }, int: { mod: 0 }, wis: { mod: 1 }, cha: { mod: -1 } },
    attributes: {
      ac: { value: 18 },
      hp: { max: 30 },
      speed: { value: 25, otherSpeeds: [{ type: 'climb', value: 20 }] },
    },
    details: { languages: { value: ['common', 'sylvan'] }, level: { value: 2 } },
    perception: { mod: 8, senses: [{ type: 'darkvision' }] },
    saves: { fortitude: { value: 9 }, reflex: { value: 7 }, will: { value: 5 } },
    skills: { acrobatics: { base: 6 }, athletics: { base: 9 } },
    traits: { rarity: 'common', size: { value: 'med' }, value: ['plant', 'humanoid'] },
  },
  items: [
    { type: 'lore', name: 'Moos Lore', system: { mod: { value: 4 } } },
    {
      type: 'melee',
      name: 'Moosdolch',
      system: {
        bonus: { value: 11 },
        damageRolls: { abc: { damage: '1d6+4', damageType: 'piercing' } },
        range: null,
        traits: { value: ['agile', 'finesse'] },
      },
    },
    {
      type: 'melee',
      name: 'Sporenkugel',
      system: {
        bonus: { value: 9 },
        damageRolls: { def: { damage: '1d6+2', damageType: 'poison' } },
        range: { increment: 20, max: null },
        traits: { value: [] },
      },
    },
    { type: 'action', name: 'Moosgriff', system: {} },
    { type: 'action', name: 'Sporenwolke', system: {} },
  ],
};

/** Derselbe Wicht, wie das Heft ihn druckt. */
const MOOSWICHT_HEFT = [
  '**Perception** +8; darkvision **Languages** Common, Sylvan',
  '**Skills** Acrobatics +6, Athletics +9, Moos Lore +4',
  '**Str** +3, **Dex** +2, **Con** +1, **Int** +0, **Wis** +1, **Cha** –1',
  '**AC** 18; **Fort** +9, **Ref** +7, **Will** +5 **HP** 30',
  '**Speed** 25 feet, climb 20 feet',
  '**Melee** [one-action] moosdolch +11 (agile, finesse), **Damage** 1d6+4 piercing',
  '**Ranged** [one-action] sporenkugel +9 (range increment 20 feet), **Damage** 1d6+2 poison',
  '**Moosgriff** [two-actions] Er greift zu. **Sporenwolke** Einmal je Kampf.',
].join(' ');

const heft = (rumpf = MOOSWICHT_HEFT, merkmale = 'MEDIUM PLANT HUMANOID') =>
  leseStatblock('MOOSWICHT CREATURE 2', merkmale, rumpf)!;

describe('normalisiere', () => {
  it('fuehrt die Schreibweisen von Heft und Kompendium zusammen', () => {
    expect(normalisiere('versatile S')).toBe(normalisiere('versatile-s'));
    expect(normalisiere('thrown 10 feet')).toBe(normalisiere('thrown-10'));
    expect(normalisiere('two-hand 1d8')).toBe(normalisiere('two-hand-d8'));
    expect(normalisiere('low-light vision')).toBe(normalisiere('low-light-vision'));
  });

  it('macht aus dem typografischen Apostroph den geraden', () => {
    // Das PDF setzt `’`, das Kompendium `'`. Ohne das galt bei der Eichung
    // jede Faehigkeit mit Apostroph als fehlend.
    expect(normalisiere('Bodyguard’s Reprisal')).toBe(normalisiere("Bodyguard's Reprisal"));
  });
});

describe('abbildAusActor', () => {
  const abbild = abbildAusActor(MOOSWICHT_ACTOR);

  it('uebersetzt den Groessenschluessel in die Schreibung des Hefts', () => {
    // Das Kompendium fuehrt `med`, die Merkmalsplakette druckt `MEDIUM`.
    expect(abbild.merkmale).toEqual(['medium', 'plant', 'humanoid']);
  });

  it('nennt die Seltenheit nur, wenn sie nicht gewoehnlich ist', () => {
    expect(abbild.merkmale).not.toContain('common');
    const selten = abbildAusActor({
      ...MOOSWICHT_ACTOR,
      system: { ...MOOSWICHT_ACTOR.system, traits: { rarity: 'rare', size: { value: 'sm' }, value: ['construct'] } },
    });
    expect(selten.merkmale).toEqual(['rare', 'small', 'construct']);
  });

  it('liest Wahrnehmung, Sinne, Sprachen und Rettungswuerfe', () => {
    expect(abbild.perception).toBe(8);
    expect(abbild.sinne).toEqual(['darkvision']);
    expect(abbild.sprachen).toEqual(['common', 'sylvan']);
    expect(abbild.rettungswuerfe).toEqual({ fort: 9, ref: 7, will: 5 });
  });

  it('nimmt Lore-Fertigkeiten aus den Items dazu', () => {
    // Sie stehen nicht in `system.skills`, sondern als eigenes Item.
    expect(abbild.fertigkeiten).toEqual([
      { name: 'acrobatics', mod: 6 },
      { name: 'athletics', mod: 9 },
      { name: 'Moos Lore', mod: 4 },
    ]);
  });

  it('erkennt den Fernkampfangriff an der Reichweite, nicht am Itemtyp', () => {
    // In PF2e ist **jeder** NSC-Angriff ein Item vom Typ `melee`.
    expect(abbild.angriffe.map((a) => [a.art, a.name])).toEqual([
      ['melee', 'Moosdolch'],
      ['ranged', 'Sporenkugel'],
    ]);
  });

  it('uebersetzt die Reichweite zurueck in ein Merkmal', () => {
    expect(abbild.angriffe[1]?.merkmale).toEqual(['range-increment-20']);
  });

  it('kommt mit fehlenden Feldern zurecht', () => {
    const leer = abbildAusActor({});
    expect(leer.merkmale).toEqual([]);
    expect(leer.angriffe).toEqual([]);
    expect(leer.ac).toBeUndefined();
  });
});

describe('vergleiche', () => {
  const vorlage = abbildAusActor(MOOSWICHT_ACTOR);

  it('meldet nichts, wenn Heft und Vorlage dasselbe sagen', () => {
    expect(vergleiche(heft(), vorlage)).toEqual([]);
  });

  it('findet ein zusaetzliches Merkmal', () => {
    const abweichungen = vergleiche(heft(MOOSWICHT_HEFT, 'MEDIUM PLANT HUMANOID FEY'), vorlage);
    expect(abweichungen).toHaveLength(1);
    expect(abweichungen[0]?.feld).toBe('Merkmale');
    expect(abweichungen[0]?.heft).toContain('fey');
  });

  it('findet einen zusaetzlichen Sinn', () => {
    const abweichungen = vergleiche(
      heft(MOOSWICHT_HEFT.replace('+8; darkvision', '+8; darkvision, low-light vision')),
      vorlage,
    );
    expect(abweichungen.map((a) => a.feld)).toEqual(['Sinne']);
  });

  it('findet ein abweichendes Tempo — auch bei Elite', () => {
    const langsamer = MOOSWICHT_HEFT.replace('**Speed** 25 feet', '**Speed** 20 feet');
    expect(vergleiche(heft(langsamer), vorlage).map((a) => a.feld)).toEqual(['Tempo']);
    expect(vergleiche(heft(langsamer), vorlage, { anpassung: 'elite' }).map((a) => a.feld)).toEqual([
      'Tempo',
    ]);
  });

  it('erkennt eine getauschte Waffe als Paar von Zeilen', () => {
    const abweichungen = vergleiche(heft(MOOSWICHT_HEFT.replace(/moosdolch/g, 'klaue')), vorlage);
    expect(abweichungen).toHaveLength(2);
    expect(abweichungen[0]).toMatchObject({ feld: 'Angriff', vorlage: '—' });
    expect(abweichungen[0]?.heft).toContain('klaue');
    expect(abweichungen[1]).toMatchObject({ feld: 'Angriff', heft: '—' });
    expect(abweichungen[1]?.vorlage).toContain('Moosdolch');
  });

  it('findet die geaenderte Schadensart derselben Waffe', () => {
    const abweichungen = vergleiche(
      heft(MOOSWICHT_HEFT.replace('1d6+4 piercing', '1d6+4 slashing')),
      vorlage,
    );
    expect(abweichungen).toHaveLength(1);
    expect(abweichungen[0]?.heft).toContain('slashing');
    expect(abweichungen[0]?.vorlage).toContain('piercing');
  });

  it('paart ueber den Namen, wenn nur die Kampfart abweicht', () => {
    // So gedruckt beim Bodyguard in 8-04: die Schleuder steht unter `Melee`.
    // Eine Zeile „hier Nahkampf, dort Fernkampf" ist brauchbar, zwei Zeilen
    // „fehlt" und „ueberzaehlig" sind es nicht.
    const alsNahkampf = MOOSWICHT_HEFT.replace('**Ranged** [one-action] sporenkugel', '**Melee** [one-action] sporenkugel');
    const abweichungen = vergleiche(heft(alsNahkampf), vorlage);
    expect(abweichungen).toHaveLength(1);
    expect(abweichungen[0]?.heft).toMatch(/^Melee sporenkugel/);
    expect(abweichungen[0]?.vorlage).toMatch(/^Ranged Sporenkugel/);
  });

  it('laesst unarmed ausser Betracht', () => {
    // Das Kompendium setzt es an jede Klaue, das Heft nur manchmal.
    const mitUnarmed = MOOSWICHT_HEFT.replace('(agile, finesse)', '(agile, finesse, unarmed)');
    expect(vergleiche(heft(mitUnarmed), vorlage)).toEqual([]);
  });

  it('meldet bei Elite und Schwach keine Zahlen', () => {
    // Die rechnet das PF2e-System beim Import selbst nach. Gemeldet wuerden
    // sonst zwoelf Zeilen, von denen keine ein Problem ist.
    const elite = MOOSWICHT_HEFT.replace('**AC** 18', '**AC** 20')
      .replace('**HP** 30', '**HP** 45')
      .replace('moosdolch +11', 'moosdolch +13');
    expect(vergleiche(heft(elite), vorlage, { anpassung: 'elite' })).toEqual([]);
    expect(vergleiche(heft(elite), vorlage).length).toBeGreaterThan(0);
  });

  it('meldet Faehigkeiten nur einseitig', () => {
    // Was das Heft nennt und die Vorlage nicht hat, ginge beim Import
    // verloren. Umgekehrt fuehrt die Vorlage regelmaessig mehr.
    const mehr = `${MOOSWICHT_HEFT} **Wurzelschlag** Neu.`;
    expect(vergleiche(heft(mehr), vorlage)).toEqual([
      { feld: 'Faehigkeiten', heft: 'Wurzelschlag', vorlage: '—' },
    ]);

    const weniger: Vorlagenabbild = {
      ...vorlage,
      faehigkeiten: [...vorlage.faehigkeiten, 'Zusatz aus dem Kompendium'],
    };
    expect(vergleiche(heft(), weniger)).toEqual([]);
  });

  it('erkennt eine Faehigkeit trotz Klammerzusatz der Vorlage', () => {
    // Das Kompendium schreibt `Construct Armor (Hardness 2)`.
    const mitZusatz: Vorlagenabbild = { ...vorlage, faehigkeiten: ['Moosgriff (Stufe 2)', 'Sporenwolke'] };
    expect(vergleiche(heft(), mitZusatz)).toEqual([]);
  });
});
