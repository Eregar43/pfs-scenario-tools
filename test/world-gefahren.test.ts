import { describe, expect, it } from 'vitest';
import { leseStatblock } from '../src/pdf/statblock.ts';
import { baueGefahr, leseIwr, leseStealth } from '../src/world/gefahren.ts';

/**
 * Die Gefahr hier ist **erfunden**; Paizo-Text gehoert nicht ins Repo. Das
 * Schema dagegen ist echt — abgelesen an `_reference/pf2e/packs/pf2e/hazards`
 * und `src/module/actor/hazard/data.ts` der Fassung 8.4.0.
 *
 * Geeicht wurde der Bau an den fuenf Gefahren der Season 8; was dabei auffiel,
 * steht hier als Testfall.
 */

const werke = {
  merkmale: new Set(['mechanical', 'trap', 'haunt', 'environmental', 'magical', 'plant']),
  immunitaeten: new Set(['critical-hits', 'object-immunities', 'precision']),
  schwaechen: new Set(['vitality', 'fire']),
  resistenzen: new Set(['cold']),
  aktionsMerkmale: new Set(['manipulate', 'curse', 'auditory']),
  angriffsMerkmale: new Set(['reach-15', 'deadly-d10', 'agile']),
};

const KETTENFALLE = [
  '**Stealth** DC 21 (trained) to notice the rusty links',
  '**Description** Eine verrostete Kette schnellt von der Decke.',
  '**Disable** DC 25 Thievery (trained) to unhook the chain',
  '**AC** 20; **Fort** +12, **Ref** +8 **Kette Hardness** 8; **HP** 32 (BT 16); ',
  '**Immunities** critical hits, object immunities, precision damage; **Weakness** fire 5',
  '**Melee** [one-action] chain +14 (reach 15 feet, deadly 1d10), **Damage** 2d6+4 bludgeoning',
  '**Routine** (2 actions) Die Kette schlaegt zu. **Critical Success** Nichts.',
  '**Kettenwirbel** [two-actions] (manipulate) Die Kette wirbelt. ',
  '**Rost** Passiv und dauerhaft.',
  '**Reset** Nach einer Stunde.',
].join(' ');

const gefahr = (rumpf = KETTENFALLE, plakette = 'COMPLEX MECHANICAL TRAP') =>
  baueGefahr(leseStatblock('KETTENFALLE HAZARD 4', plakette, rumpf)!, werke);

describe('leseStealth', () => {
  it('rechnet einen Schwierigkeitsgrad in den Modifikator um', () => {
    // Das System speichert den Modifikator; den Grad rechnet es als 10 + Wert.
    expect(leseStealth('DC 21 (trained)')).toEqual({ wert: 11, zusatz: '(trained)' });
  });

  it('nimmt einen Modifikator, wie er dasteht', () => {
    // Komplexe Gefahren wuerfeln damit Initiative und drucken deshalb `+16`.
    expect(leseStealth('+16 (expert) to notice quiet footsteps')).toEqual({
      wert: 16,
      zusatz: '(expert) to notice quiet footsteps',
    });
  });

  it('kommt ohne Heimlichkeit zurecht', () => {
    expect(leseStealth(undefined)).toEqual({ wert: null, zusatz: '' });
    expect(leseStealth('unbestimmt')).toEqual({ wert: null, zusatz: 'unbestimmt' });
  });
});

describe('leseIwr', () => {
  it('trennt Schluessel und Staerke', () => {
    expect(leseIwr('fire 5')).toEqual({ typ: 'fire', wert: 5 });
    expect(leseIwr('critical hits')).toEqual({ typ: 'critical-hits' });
  });

  it('kennt den Sonderfall precision damage', () => {
    // Das System fuehrt `precision`, nicht `precision-damage` — anders als bei
    // `area damage`, das `area-damage` heisst. Eine Regel gibt es dafuer nicht.
    expect(leseIwr('precision damage')).toEqual({ typ: 'precision' });
    expect(leseIwr('area damage')).toEqual({ typ: 'area-damage' });
  });
});

describe('baueGefahr', () => {
  const { daten, ungenutzt } = gefahr();
  const system = daten['system'] as Record<string, any>;
  const items = daten['items'] as Array<Record<string, any>>;

  it('baut einen Actor vom Typ hazard', () => {
    expect(daten['type']).toBe('hazard');
    expect(daten['name']).toBe('Kettenfalle');
    expect(system['details'].level.value).toBe(4);
  });

  it('macht aus complex kein Merkmal, sondern das Feld isComplex', () => {
    expect(system['details'].isComplex).toBe(true);
    expect(system['traits'].value).toEqual(['mechanical', 'trap']);
  });

  it('laesst das Gattungswort hazard weg', () => {
    // Es steht in der Plakette, ist aber in keiner der 53 mitgelieferten
    // Gefahren ein Merkmal — geschrieben ergaebe es ein unbekanntes.
    const { daten: d } = gefahr(KETTENFALLE, 'ENVIRONMENTAL HAZARD MAGICAL');
    expect((d['system'] as any).traits.value).toEqual(['environmental', 'magical']);
  });

  it('nimmt die Seltenheit aus der Plakette in ihr eigenes Feld', () => {
    const { daten: d } = gefahr(KETTENFALLE, 'RARE MECHANICAL TRAP');
    expect((d['system'] as any).traits.rarity).toBe('rare');
    expect((d['system'] as any).traits.value).toEqual(['mechanical', 'trap']);
  });

  it('setzt Ruestung, Haerte und Trefferpunkte samt Zusatz', () => {
    expect(system['attributes'].ac.value).toBe(20);
    expect(system['attributes'].hardness).toBe(8);
    expect(system['attributes'].hp).toMatchObject({ max: 32, value: 32, details: '(BT 16)' });
  });

  it('laesst einen fehlenden Rettungswurf null statt null-gleich 0', () => {
    // Das System unterscheidet beides: `null` heisst „hat keinen", `0` heisst
    // „hat einen, und der ist 0".
    expect(system['saves']).toEqual({
      fortitude: { value: 12, saveDetail: '' },
      reflex: { value: 8, saveDetail: '' },
      will: { value: null, saveDetail: '' },
    });
  });

  it('schreibt die Heimlichkeit als Modifikator mit dem Zusatz als HTML', () => {
    expect(system['attributes'].stealth).toEqual({
      value: 11,
      details: '<p>(trained) to notice the rusty links</p>',
    });
  });

  it('uebersetzt Immunitaeten und Schwaechen in die Form des Systems', () => {
    expect(system['attributes'].immunities).toEqual([
      { type: 'critical-hits' },
      { type: 'object-immunities' },
      { type: 'precision' },
    ]);
    expect(system['attributes'].weaknesses).toEqual([{ type: 'fire', value: 5 }]);
  });

  it('baut jeden Angriff als melee-Item mit umgeschriebenen Merkmalen', () => {
    const angriff = items.find((i) => i['type'] === 'melee')!;
    expect(angriff['name']).toBe('chain');
    expect(angriff['system'].bonus.value).toBe(14);
    // `reach 15 feet` → `reach-15`, `deadly 1d10` → `deadly-d10`.
    expect(angriff['system'].traits.value).toEqual(['reach-15', 'deadly-d10']);
    expect(Object.values(angriff['system'].damageRolls)).toEqual([
      { damage: '2d6+4', damageType: 'bludgeoning' },
    ]);
  });

  it('leitet den Schluessel des Schadenswurfs ab, statt ihn zu wuerfeln', () => {
    // Zwei Laeufe muessen dieselben Daten ergeben, sonst meldet jeder erneute
    // Import eine Aenderung.
    const a = gefahr().daten as any;
    const b = gefahr().daten as any;
    expect(Object.keys(a.items[0].system.damageRolls)).toEqual(
      Object.keys(b.items[0].system.damageRolls),
    );
  });

  it('uebersetzt die Aktionsplakette in Art und Anzahl', () => {
    const wirbel = items.find((i) => i['name'] === 'Kettenwirbel')!;
    expect(wirbel['system'].actionType.value).toBe('action');
    expect(wirbel['system'].actions.value).toBe(2);
    expect(wirbel['system'].traits.value).toEqual(['manipulate']);
  });

  it('macht aus einer Faehigkeit ohne Plakette eine passive', () => {
    const rost = items.find((i) => i['name'] === 'Rost')!;
    expect(rost['system'].actionType.value).toBe('passive');
    expect(rost['system'].actions.value).toBeNull();
    expect(rost['system'].description.value).toBe('<p>Passiv und dauerhaft.</p>');
  });

  it('haengt die Erfolgsgrade an die Routine statt an eine Faehigkeit', () => {
    expect(system['details'].routine).toContain('Critical Success');
    expect(items.map((i) => i['name'])).not.toContain('Critical Success');
  });

  it('meldet einen Schluessel, den das System nicht kennt', () => {
    // Verworfen wird er trotzdem — geschrieben wuerde er stillschweigend
    // verschluckt, und dann faellt der Fehler erst am Spieltisch auf.
    const { daten: d, ungenutzt: u } = gefahr(
      KETTENFALLE.replace('**Weakness** fire 5', '**Weakness** rostfrass 5'),
    );
    expect((d['system'] as any).attributes.weaknesses).toEqual([]);
    expect(u).toContain('Schwaeche: rostfrass 5');
  });

  it('meldet eine Schwaeche ohne Zahl, statt eine zu erfinden', () => {
    const { ungenutzt: u } = gefahr(
      KETTENFALLE.replace('**Weakness** fire 5', '**Weakness** fire'),
    );
    expect(u).toContain('Schwaeche: fire');
  });

  it('meldet Felder, die eine Gefahr gar nicht hat', () => {
    // Stehen sie da, wurde die Kopfzeile wahrscheinlich falsch gelesen.
    const { ungenutzt: u } = gefahr(`${KETTENFALLE} **Languages** Common **Perception** +9`);
    expect(u).toEqual(expect.arrayContaining(['Wahrnehmung', 'Sprachen']));
  });

  it('uebersetzt audible in auditory', () => {
    // `Shh!` aus 8-03 druckt `(audible, curse)`; das System kennt nur
    // `auditory`. Der Autor hat es als Satzfehler des Hefts
    // bestaetigt — ohne diese Bestaetigung waere es gemeldet worden.
    const { daten: d, ungenutzt: u } = gefahr(
      KETTENFALLE.replace(
        '**Kettenwirbel** [two-actions] (manipulate)',
        '**Kettenwirbel** [two-actions] (audible, manipulate)',
      ),
    );
    const wirbel = (d['items'] as any[]).find((i) => i['name'] === 'Kettenwirbel')!;
    expect(wirbel['system'].traits.value).toEqual(['auditory', 'manipulate']);
    expect(u).toEqual([]);
  });

  it('meldet ein Merkmal, das das System nicht kennt', () => {
    // Geschrieben ergaebe es eine Validierungsmeldung beim Anlegen.
    const { daten: d, ungenutzt: u } = gefahr(
      KETTENFALLE.replace(
        '**Kettenwirbel** [two-actions] (manipulate)',
        '**Kettenwirbel** [two-actions] (rostig, manipulate)',
      ),
    );
    const wirbel = (d['items'] as any[]).find((i) => i['name'] === 'Kettenwirbel')!;
    expect(wirbel['system'].traits.value).toEqual(['manipulate']);
    expect(u).toContain('Merkmal Kettenwirbel: rostig');
  });

  it('schreibt die Reichweite ins eigene Feld, nicht unter die Merkmale', () => {
    // `range-increment-20` ist kein Merkmalsschluessel; als solcher wies
    // Foundry ihn ab. Das System fuehrt die Reichweite in `system.range`.
    const { daten: d, ungenutzt: u } = gefahr(
      KETTENFALLE.replace('(reach 15 feet, deadly 1d10)', '(agile, range increment 20 feet)'),
    );
    const angriff = (d['items'] as any[]).find((i) => i['type'] === 'melee')!;
    expect(angriff['system'].range).toEqual({ increment: 20, max: null });
    expect(angriff['system'].traits.value).toEqual(['agile']);
    expect(u).toEqual([]);
  });

  it('laesst range null, wo keine Reichweite steht', () => {
    const angriff = (items.find((i) => i['type'] === 'melee'))!;
    expect(angriff['system'].range).toBeNull();
  });

  it('laesst bei der erfundenen Gefahr nichts liegen', () => {
    expect(ungenutzt).toEqual([]);
  });
});

describe('baueGefahr — Quellenangabe', () => {
  it('traegt das Heft als Quelle, wie die Gefahren der Season-Module', () => {
    const { daten } = baueGefahr(
      leseStatblock('KETTENFALLE HAZARD 4', 'COMPLEX MECHANICAL TRAP', KETTENFALLE)!,
      werke,
      'Pathfinder Society Scenario #8-01: Intro',
    );

    expect((daten.system as { details: { publication: unknown } }).details.publication).toEqual({
      title: 'Pathfinder Society Scenario #8-01: Intro',
      authors: '',
      license: 'ORC',
      remaster: true,
    });
  });

  it('laesst sie leer, wenn keine mitkommt', () => {
    const system = gefahr().daten.system as { details: { publication: { title: string } } };
    expect(system.details.publication.title).toBe('');
  });
});
