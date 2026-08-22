import { describe, expect, it } from 'vitest';
import { enrichChecks, slugifySkill } from '../src/pdf/checks.ts';

describe('slugifySkill', () => {
  it('macht aus dem Namen den Slug des Systems', () => {
    expect(slugifySkill('Acrobatics')).toBe('acrobatics');
    expect(slugifySkill('Bhopan Lore')).toBe('bhopan-lore');
    expect(slugifySkill('Cayden Cailean Lore')).toBe('cayden-cailean-lore');
  });
});

describe('enrichChecks', () => {
  it('setzt die einfache Fertigkeitsprobe', () => {
    // Der Nachsatz bleibt stehen — genau so halten es die offiziellen Journale.
    expect(enrichChecks('Attempt a DC 15 Perception check to Search.')).toBe(
      'Attempt a @Check[perception|dc:15] check to Search.',
    );
  });

  it('gibt jeder Fertigkeit einer Aufzaehlung ihre eigene Probe', () => {
    // Zusammengefasst (`@Check[acrobatics,thievery|dc:16]`) setzt Foundry
    // untereinanderstehende Knoepfe mit Luft dazwischen; im Blatt einer Gefahr
    // reisst das den Satz auseinander. Die Trenner des Hefts bleiben stehen.
    expect(enrichChecks('a DC 16 Acrobatics or Thievery check')).toBe(
      'a @Check[acrobatics|dc:16] or @Check[thievery|dc:16] check',
    );
    expect(enrichChecks('a DC 15 Arcana, Crafting, or Occultism check')).toBe(
      'a @Check[arcana|dc:15], @Check[crafting|dc:15], or @Check[occultism|dc:15] check',
    );
  });

  it('trennt zwei Proben mit eigenen Schwierigkeiten', () => {
    // `DC 18 Society check or DC 16 Bhopan Lore check` sind zwei Proben, nicht
    // eine mit zwei Fertigkeiten.
    expect(enrichChecks('a DC 18 Society check or DC 16 Bhopan Lore check')).toBe(
      'a @Check[society|dc:18] check or @Check[bhopan-lore|dc:16] check',
    );
  });

  it('erkennt Wissensfertigkeiten', () => {
    expect(enrichChecks('a DC 13 Underworld Lore to recall')).toBe(
      'a @Check[underworld-lore|dc:13] to recall',
    );
  });

  it('haengt basic nur an den Rettungswurf', () => {
    expect(enrichChecks('takes damage (DC 15 basic Reflex save)')).toBe(
      'takes damage (@Check[reflex|dc:15|basic] save)',
    );
    expect(enrichChecks('a DC 15 Fortitude save or spend its next action')).toBe(
      'a @Check[fortitude|dc:15] save or spend its next action',
    );
  });

  it('laesst eine Probe ohne Fertigkeit in Ruhe', () => {
    // `DC 18 check` nennt keine Fertigkeit — daraus laesst sich keine Probe
    // bauen, und geraten wird nicht.
    const text = 'Each PC can attempt a DC 18 check that could reasonably help.';
    expect(enrichChecks(text)).toBe(text);
  });

  it('laesst die Stealth-Schwierigkeit einer Gefahr in Ruhe', () => {
    // Dort steht die Schwierigkeit **hinter** der Fertigkeit; sie ist der Wert
    // der Gefahr, nicht die Probe eines Charakters.
    const text = 'Hazard 1 Page 10 Stealth DC 15 (trained)';
    expect(enrichChecks(text)).toBe(text);
  });

  it('laesst eine Schwierigkeit hinter der Fertigkeit stehen', () => {
    const text = 'or against a PC’s Deception DC if they’ve lied';
    expect(enrichChecks(text)).toBe(text);
  });

  it('nimmt die zweite Fertigkeit mit, wenn eine Ausbildungsstufe dazwischen steht', () => {
    // `DC 25 Crafting (trained) or Thievery (trained)` — die Klammer beendete
    // frueher die Aufzaehlung, und `Thievery` blieb abgetippter Text. So
    // gedruckt steht es bei den Gefahren aus 8-01 und 8-03.
    expect(enrichChecks('DC 25 Crafting (trained) or Thievery (trained) to secure the balcony')).toBe(
      '@Check[crafting|dc:25] (trained) or @Check[thievery|dc:25] (trained) to secure the balcony',
    );
  });

  it('trennt die Proben, wenn die Ausbildungsstufen auseinandergehen', () => {
    // Sie zusammenzufassen wuerde eine der beiden Stufen unterschlagen. In der
    // Season 8 kommt das nicht vor; der Fall ist erfunden.
    expect(enrichChecks('DC 23 Religion (trained) or Occultism (expert) zum Bannen')).toBe(
      '@Check[religion|dc:23] (trained) or @Check[occultism|dc:23] (expert) zum Bannen',
    );
  });

  it('laesst zwei Proben mit eigener Schwierigkeit getrennt', () => {
    expect(
      enrichChecks('DC 21 Athletics to hold the door, DC 21 Crafting (trained) to wedge it'),
    ).toBe('@Check[athletics|dc:21] to hold the door, @Check[crafting|dc:21] (trained) to wedge it');
  });
});

describe('enrichChecks — Wurf-Optionen', () => {
  it('haengt die Optionen an die Probe', () => {
    // Damit grenzt ein Szenario-Effekt seinen Bonus auf eine Begegnung ein.
    expect(enrichChecks('DC 17 Acrobatics check', ['pfs-08-04-page-7'])).toBe(
      '@Check[acrobatics|dc:17|options:pfs-08-04-page-7] check',
    );
  });

  it('laesst die Probe ohne Optionen unveraendert', () => {
    expect(enrichChecks('DC 17 Acrobatics check')).toBe('@Check[acrobatics|dc:17] check');
  });
});
