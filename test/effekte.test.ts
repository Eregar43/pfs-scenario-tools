import { describe, expect, it } from 'vitest';
import { sammleEffekte } from '../src/pdf/effekte.ts';
import type { Block, BlockRole } from '../src/pdf/types.ts';

function block(text: string, role: BlockRole = 'check-result'): Block {
  return { role, page: 4, column: 0, lines: [], text };
}

/**
 * Erfundene Saetze, die den fuenf Satzbauformen nachgebildet sind, an denen der
 * Erkenner in der Season 8 anschlaegt. **Wortlaut aus den Heften steht hier
 * bewusst nicht** — er gehoert Paizo und hat in einem oeffentlichen Repo nichts
 * verloren (siehe `NOTICE.md`). Geprueft wird die Form, nicht der Inhalt: Wer
 * eine neue Form aufnimmt, baut sie hier ebenso nach.
 */
const HEFT = {
  backen: block(
    '- **Critical Success** Rope-making is the pride of the harbour guild, and the PC ' +
      'knows what sets a guild braid apart. The PC has a +1 circumstance ' +
      'bonus on checks in the Rope and Riddle encounter below.',
  ),
  theater: block(
    '- **Critical Success** As success, and the PC knows the caretaker moved into the mill ' +
      'building after its closure. The PC gains a +1 circumstance bonus to Perception ' +
      'checks while inside the mill.',
  ),
  jagd: block(
    '- **Critical Success** The harbour district is a chaotic maze of twisting lanes. ' +
      'If any PC achieves this result, all PCs gain a +1 circumstance bonus on all ' +
      'challenges in the chase on page 7.',
  ),
  kapitaen: block(
    '- **Critical Success** Rumor has it that one Captain Ashfell needs funds. ' +
      'If any PC achieves this result, all PCs gain a +1 circumstance bonus on initiative ' +
      'rolls in the combat against the captain on page 8.',
  ),
  piraten: block(
    'This grants the smugglers time to prepare for any attack, granting all enemies in the ' +
      '**Dockside Ambush** encounter below a +2 circumstance bonus to their initiative rolls.',
    'body',
  ),
};

describe('sammleEffekte', () => {
  it('findet den Initiative-Bonus und ordnet ihn der richtigen Domaene zu', () => {
    const [effekt] = sammleEffekte([HEFT.kapitaen]);

    expect(effekt).toMatchObject({ wert: 1, art: 'circumstance', ziel: 'gruppe' });
    expect(effekt?.domaenen).toEqual(['initiative']);
    expect(effekt?.worauf).toContain('initiative rolls');
  });

  it('erkennt Wahrnehmung getrennt von den uebrigen Proben', () => {
    expect(sammleEffekte([HEFT.theater])[0]?.domaenen).toEqual(['perception']);
  });

  it('macht aus „alle Proben" Fertigkeiten und Rettungswuerfe', () => {
    // `all` waere zu breit — es traegt auch Ruestungsklasse und Schaden.
    expect(sammleEffekte([HEFT.jagd])[0]?.domaenen).toEqual(['skill-check', 'saving-throw']);
    expect(sammleEffekte([HEFT.backen])[0]?.domaenen).toEqual(['skill-check', 'saving-throw']);
  });

  it('unterscheidet einen Effekt fuer die Gegner', () => {
    const [effekt] = sammleEffekte([HEFT.piraten]);

    expect(effekt).toMatchObject({ wert: 2, ziel: 'gegner' });
    expect(effekt?.domaenen).toEqual(['initiative']);
  });

  it('uebergeht Statbloecke', () => {
    // Auch sie sind voller Boni. Die gehoeren zur Kreatur und stehen laengst
    // in ihrem Actor.
    const statblock = block(
      '**Shield Partner** The guard grants an adjacent ally a +2 circumstance ' +
        'bonus to AC. The porter gains a +2 item bonus to melee damage rolls.',
      'statblock',
    );

    expect(sammleEffekte([statblock])).toEqual([]);
  });

  it('uebergeht Saetze ohne Gruppe oder Gegner', () => {
    // Derselbe Wortlaut, aber ueber ein Ziel statt ueber die Gruppe.
    const fremd = block('The target takes a -1 circumstance penalty to its Speeds.', 'body');

    expect(sammleEffekte([fremd])).toEqual([]);
  });

  it('liest auch einen Malus mit Halbgeviertstrich', () => {
    // Die Hefte setzen `–`, nicht den Bindestrich.
    const malus = block(
      'All PCs have a –1 circumstance penalty to Perception checks in the fog.',
      'body',
    );

    expect(sammleEffekte([malus])[0]).toMatchObject({ wert: -1, domaenen: ['perception'] });
  });

  it('nimmt denselben Effekt nur einmal', () => {
    // Die Hefte wiederholen die Zusage in der Begegnung selbst.
    expect(sammleEffekte([HEFT.kapitaen, HEFT.kapitaen])).toHaveLength(1);
  });

  it('laesst die Domaenen leer, statt ein Ziel zu raten', () => {
    const unklar = block(
      'All PCs gain a +1 circumstance bonus to their standing with the harbour guild.',
      'body',
    );

    expect(sammleEffekte([unklar])[0]?.domaenen).toEqual([]);
  });

  it('findet in jeder der fuenf Formen genau einen Effekt', () => {
    const alle = sammleEffekte(Object.values(HEFT));

    expect(alle).toHaveLength(5);
    expect(alle.filter((e) => e.ziel === 'gegner')).toHaveLength(1);
    expect(alle.every((e) => e.domaenen.length > 0)).toBe(true);
  });
});
