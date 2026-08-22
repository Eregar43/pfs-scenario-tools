import { describe, expect, it } from 'vitest';
import {
  leseStatblock,
  sammleStatbloecke,
  teileOben,
  zerlegeAbschnitte,
} from '../src/pdf/statblock.ts';
import type { Block } from '../src/pdf/types.ts';

/**
 * Die Statbloecke hier sind **erfunden**. Sie ahmen Paizos Satzform nach, aber
 * kein Wort stammt aus einem Heft — Paizo-Text gehoert nicht ins Repo (siehe
 * `CLAUDE.md`, „Was hier niemals hineingehoert"). Geeicht wurde der Leser
 * gegen die echten sechzehn Statbloecke der Season 8; was dabei auffiel, steht
 * hier als Testfall.
 */

/** Ein Statblock, wie der Blockstrom ihn liefert: Kopf, Merkmale, Rumpf. */
const KLETTERWICHT = {
  kopf: 'MOOSWICHT CREATURE 2',
  merkmale: 'MEDIUM PLANT HUMANOID',
  rumpf: [
    'Variant tunnelwicht (*Erfundenes Grundwerk* 42)',
    '**Perception** +8; darkvision **Languages** Common, Sylvan',
    '**Skills** Acrobatics +6, Athletics +9 (+12 to Climb), Moos Lore +4',
    '**Str** +3, **Dex** +2, **Con** +1, **Int** +0, **Wis** +1, **Cha** –1',
    '**Items** moosdolch, seil (30 feet)',
    '**AC** 18; **Fort** +9, **Ref** +7, **Will** +5 **HP** 30',
    '**Speed** 25 feet, climb 20 feet',
    '**Melee** [one-action] moosdolch +11 (agile, finesse), **Damage** 1d6+4 piercing',
    '**Melee** [one-action] ranke +11 (reach 10 feet), **Damage** 1d4+4 bludgeoning plus 1d4 persistent bleed',
    '**Ranged** [one-action] sporenkugel +9 (range increment 20 feet), **Damage** 1d6+2 poison',
    '**Moosgriff** [two-actions] (manipulate) **Requirements** Der Mooswicht hat eine Hand frei;',
    '**Effect** Der Mooswicht greift zu.',
    '**Sporenwolke** Einmal je Kampf.',
  ].join(' '),
};

function block(role: Block['role'], text: string): Block {
  return { role, page: 1, column: 0, text, lines: [] };
}

describe('teileOben', () => {
  it('trennt an Kommas, aber nicht in Klammern', () => {
    expect(teileOben('Acrobatics +6, Athletics +9 (+12 to Climb), Moos Lore +4')).toEqual([
      'Acrobatics +6',
      'Athletics +9 (+12 to Climb)',
      'Moos Lore +4',
    ]);
  });

  it('wirft leere Stuecke weg', () => {
    expect(teileOben('a, , b,')).toEqual(['a', 'b']);
  });
});

describe('zerlegeAbschnitte', () => {
  it('gibt dem Text vor dem ersten Etikett das leere Etikett', () => {
    expect(zerlegeAbschnitte('*Buch* 12 **HP** 30')).toEqual([
      { etikett: '', text: '*Buch* 12' },
      { etikett: 'HP', text: '30' },
    ]);
  });

  it('putzt Satzzeichen vom Etikett, die im Fettsatz mitgerutscht sind', () => {
    // So gesetzt steht es im Heft: `**AC** 18**; Fort** +11`. Ohne die
    // Bereinigung hiesse das Etikett `; Fort` und der Rettungswurf fiele aus.
    expect(zerlegeAbschnitte('**AC** 18**; Fort** +11').map((a) => a.etikett)).toEqual([
      '',
      'AC',
      'Fort',
    ]);
  });

  it('laesst ein Ausrufezeichen im Namen stehen', () => {
    expect(zerlegeAbschnitte('**Pssst!** Leise.')[1]?.etikett).toBe('Pssst!');
  });
});

describe('leseStatblock', () => {
  const gelesen = leseStatblock(KLETTERWICHT.kopf, KLETTERWICHT.merkmale, KLETTERWICHT.rumpf)!;

  it('liest die Kopfzeile trotz Versalien', () => {
    expect(gelesen.name).toBe('Mooswicht');
    expect(gelesen.stufe).toBe(2);
    expect(gelesen.art).toBe('creature');
  });

  it('nimmt die Merkmalsplakette kleingeschrieben', () => {
    expect(gelesen.merkmale).toEqual(['medium', 'plant', 'humanoid']);
  });

  it('hebt die Quellenzeile im Wortlaut auf', () => {
    expect(gelesen.quelle).toBe('Variant tunnelwicht (*Erfundenes Grundwerk* 42)');
  });

  it('trennt Wahrnehmung und Sinne am Semikolon', () => {
    expect(gelesen.perception).toBe(8);
    expect(gelesen.sinne).toEqual(['darkvision']);
  });

  it('liest Sprachen, Gegenstaende und Fertigkeiten samt Klammerzusatz', () => {
    expect(gelesen.sprachen).toEqual(['Common', 'Sylvan']);
    expect(gelesen.gegenstaende).toEqual(['moosdolch', 'seil (30 feet)']);
    expect(gelesen.fertigkeiten).toEqual([
      { name: 'Acrobatics', mod: 6 },
      { name: 'Athletics', mod: 9, zusatz: '+12 to Climb' },
      { name: 'Moos Lore', mod: 4 },
    ]);
  });

  it('versteht den Gedankenstrich als Minus', () => {
    expect(gelesen.attribute).toEqual({ str: 3, dex: 2, con: 1, int: 0, wis: 1, cha: -1 });
  });

  it('liest Ruestung, Rettungswuerfe und Trefferpunkte', () => {
    expect(gelesen.ac).toBe(18);
    expect(gelesen.rettungswuerfe).toEqual({ fort: 9, ref: 7, will: 5 });
    expect(gelesen.tp).toBe(30);
  });

  it('trennt Gehgeschwindigkeit von den uebrigen Bewegungsarten', () => {
    expect(gelesen.tempo).toEqual({ wert: 25, weitere: ['climb 20 feet'] });
  });

  it('paart jeden Angriff mit seiner Schadenszeile', () => {
    expect(gelesen.angriffe).toEqual([
      {
        art: 'melee',
        name: 'moosdolch',
        mod: 11,
        merkmale: ['agile', 'finesse'],
        schaden: '1d6+4 piercing',
        formel: '1d6+4',
        schadensart: 'piercing',
      },
      {
        art: 'melee',
        name: 'ranke',
        mod: 11,
        merkmale: ['reach 10 feet'],
        schaden: '1d4+4 bludgeoning plus 1d4 persistent bleed',
        formel: '1d4+4',
        schadensart: 'bludgeoning',
      },
      {
        art: 'ranged',
        name: 'sporenkugel',
        mod: 9,
        merkmale: ['range increment 20 feet'],
        schaden: '1d6+2 poison',
        formel: '1d6+2',
        schadensart: 'poison',
      },
    ]);
  });

  it('zaehlt benannte Faehigkeiten, aber nicht ihre Unterpunkte', () => {
    expect(gelesen.faehigkeiten.map((f) => f.name)).toEqual(['Moosgriff', 'Sporenwolke']);
  });

  it('liest Aktionsplakette, Merkmale und Text einer Faehigkeit', () => {
    // Der Text wird gebraucht, sobald aus einem Statblock etwas gebaut werden
    // soll — eine szenarioeigene Gefahr hat kein Gegenstueck im Kompendium.
    expect(gelesen.faehigkeiten[0]).toEqual({
      name: 'Moosgriff',
      plakette: 'two-actions',
      merkmale: ['manipulate'],
      text: '**Requirements** Der Mooswicht hat eine Hand frei; **Effect** Der Mooswicht greift zu.',
    });
  });

  it('laesst die Plakette weg, wo das Heft keine setzt', () => {
    expect(gelesen.faehigkeiten[1]).toEqual({
      name: 'Sporenwolke',
      merkmale: [],
      text: 'Einmal je Kampf.',
    });
  });

  it('laesst nichts unbemerkt liegen', () => {
    expect(gelesen.rest).toEqual([]);
  });

  it('verweigert eine Kopfzeile, die kein Statblock ist', () => {
    expect(leseStatblock('A. THE LABORATORY', 'MEDIUM', '**HP** 10')).toBeUndefined();
  });
});

describe('leseStatblock, Einzelfaelle aus der Eichung', () => {
  const lies = (rumpf: string) => leseStatblock('PRUEFWICHT CREATURE 1', 'MEDIUM PLANT', rumpf)!;

  it('haengt eine Schadenszeile nur an den unmittelbar vorigen Angriff', () => {
    // Steht etwas zwischen Angriff und Schaden, ist die Zuordnung geraten —
    // dann gehoert die Zeile in den Rest, nicht an den falschen Angriff.
    const gelesen = lies('**Melee** [one-action] ranke +5, **HP** 20 **Damage** 1d6 bludgeoning');
    expect(gelesen.angriffe[0]?.schaden).toBeUndefined();
    expect(gelesen.rest).toEqual([{ etikett: 'Damage', text: '1d6 bludgeoning' }]);
  });

  it('nimmt die Haerte auch mit vorangestelltem Gegenstandsnamen', () => {
    // Gefahren schreiben `**Verrostete Kette Hardness** 6`, Kreaturen nur
    // `**Hardness** 2`.
    expect(lies('**Verrostete Kette Hardness** 6; **HP** 24 (BT 12)').haerte).toBe(6);
    expect(lies('**Hardness** 2').haerte).toBe(2);
  });

  it('hebt den Zusatz hinter Ruestung und Trefferpunkten auf', () => {
    const gelesen = lies('**AC** 15 (13 when broken), construct armor; **HP** 10 per usher');
    expect(gelesen.ac).toBe(15);
    expect(gelesen.acZusatz).toBe('(13 when broken), construct armor');
    expect(gelesen.tp).toBe(10);
    expect(gelesen.tpZusatz).toBe('per usher');
  });

  it('versteht Schwaeche und Resistenz in Einzahl wie in Mehrzahl', () => {
    expect(lies('**Weakness** vitality 5').schwaechen).toEqual(['vitality 5']);
    expect(lies('**Weaknesses** axes 5, fire 5').schwaechen).toEqual(['axes 5', 'fire 5']);
    expect(lies('**Resistance** cold 3').resistenzen).toEqual(['cold 3']);
  });

  it('zieht die Erfolgsgrade zur Routine, nicht zu einer neuen Faehigkeit', () => {
    // Hier ist der Leser bei der Eichung aufgelaufen: Nach `Routine` folgen in
    // Gefahren noch einmal die vier Erfolgsgrade. Sie sind nie ein eigener
    // Eintrag — kein Statblock hat eine Faehigkeit namens `Success`.
    const gelesen = lies(
      '**Routine** (2 actions) Die Kette schlaegt zu. **Critical Success** Nichts. ' +
        '**Success** Wenig. **Failure** Viel. **Critical Failure** Sehr viel.',
    );
    expect(gelesen.faehigkeiten).toEqual([]);
    // Und der Text der Erfolgsgrade landet bei der Routine, statt zu verfallen:
    // ohne ihn waere die Gefahr in der Welt unbrauchbar.
    expect(gelesen.routine).toBe(
      '(2 actions) Die Kette schlaegt zu. **Critical Success** Nichts. ' +
        '**Success** Wenig. **Failure** Viel. **Critical Failure** Sehr viel.',
    );
  });

  it('sortiert die Felder einer Gefahr getrennt von den Faehigkeiten ein', () => {
    const gelesen = lies(
      '**Stealth** DC 21 (trained) **Description** Der Boden bricht. ' +
        '**Disable** DC 25 Thievery **Reset** Nach einer Stunde. **Einsturz** [reaction] Bumm.',
    );
    expect(gelesen.stealth).toBe('DC 21 (trained)');
    expect(gelesen.beschreibung).toBe('Der Boden bricht.');
    expect(gelesen.entschaerfen).toBe('DC 25 Thievery');
    expect(gelesen.ruecksetzung).toBe('Nach einer Stunde.');
    expect(gelesen.faehigkeiten.map((f) => f.name)).toEqual(['Einsturz']);
  });

  it('legt ein unbekanntes Etikett als Faehigkeit ab, statt es zu verlieren', () => {
    expect(lies('**Voellig Neues Feld** 3').faehigkeiten.map((f) => f.name)).toEqual([
      'Voellig Neues Feld',
    ]);
  });
});

describe('sammleStatbloecke', () => {
  it('nimmt nur Kopfzeilen, hinter denen eine Merkmalsplakette steht', () => {
    // Dieselbe Kopfzeile steht auch in der Begegnungsliste, dort aber gefolgt
    // von Fliesstext. Nur der Anhang setzt die Merkmale darunter.
    const blocks: Block[] = [
      block('box-heading', 'MOOSWICHT CREATURE 2'),
      block('body', 'Page 10 **Initiative** +8'),
      block('heading', 'Appendix: Statistics'),
      block('box-heading', 'MOOSWICHT CREATURE 2'),
      block('traits', 'MEDIUM PLANT HUMANOID'),
      block('statblock', '**Perception** +8 **HP** 30'),
    ];

    const gefunden = sammleStatbloecke(blocks);
    expect(gefunden).toHaveLength(1);
    expect(gefunden[0]?.tp).toBe(30);
  });

  it('fuegt alle Bloecke bis zur naechsten Ueberschrift zum Rumpf zusammen', () => {
    const blocks: Block[] = [
      block('box-heading', 'MOOSWICHT CREATURE 2'),
      block('traits', 'MEDIUM PLANT'),
      block('statblock', '**Perception** +8'),
      block('box', '**HP** 30'),
      block('check-result', '**Speed** 25 feet'),
      block('box-heading', 'RANKENWICHT CREATURE 3'),
      block('traits', 'LARGE PLANT'),
      block('statblock', '**HP** 45'),
    ];

    const gefunden = sammleStatbloecke(blocks);
    expect(gefunden.map((s) => s.name)).toEqual(['Mooswicht', 'Rankenwicht']);
    expect(gefunden[0]?.perception).toBe(8);
    expect(gefunden[0]?.tp).toBe(30);
    expect(gefunden[0]?.tempo?.wert).toBe(25);
  });

  it('findet auch Gefahren und die Anzahl hinter dem Namen', () => {
    const blocks: Block[] = [
      block('box-heading', 'FALLENDE KISTEN (3) HAZARD 4'),
      block('traits', 'MECHANICAL TRAP'),
      block('statblock', '**Stealth** DC 20 (trained)'),
    ];

    const gefunden = sammleStatbloecke(blocks);
    expect(gefunden[0]?.art).toBe('hazard');
    expect(gefunden[0]?.name).toBe('Fallende Kisten (3)');
    expect(gefunden[0]?.stufe).toBe(4);
  });
});
