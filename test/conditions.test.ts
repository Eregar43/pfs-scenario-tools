import { describe, expect, it } from 'vitest';
import { ConditionIndex, conditionUuid, enrichConditions, type ConditionEntry } from '../src/pdf/conditions.ts';

const condition = (name: string, id: string, valued = false): ConditionEntry => ({
  name,
  pack: 'pf2e.conditionitems',
  id,
  valued,
});

const ENTRIES: ConditionEntry[] = [
  condition('Prone', 'aaaaaaaaaaaaaaaa'),
  condition('Off-Guard', 'bbbbbbbbbbbbbbbb'),
  condition('Unconscious', 'cccccccccccccccc'),
  condition('Frightened', 'dddddddddddddddd', true),
  condition('Sickened', 'eeeeeeeeeeeeeeee', true),
  condition('Drained', 'ffffffffffffffff', true),
  // Ausgeschlossene Namen bleiben im Index vorhanden, tauchen aber weder in
  // `find` noch in `names` auf.
  condition('Friendly', 'gggggggggggggggg'),
  condition('Confused', 'hhhhhhhhhhhhhhhh'),
];

const index = new ConditionIndex(ENTRIES);

describe('ConditionIndex', () => {
  it('findet eine Bedingung unabhaengig von Gross-/Kleinschreibung', () => {
    expect(index.find('prone')?.name).toBe('Prone');
    expect(index.find('PRONE')?.name).toBe('Prone');
  });

  it('loest den alten Namen flat-footed auf off-guard auf', () => {
    expect(index.find('flat-footed')?.name).toBe('Off-Guard');
    expect(index.find('flat footed')?.name).toBe('Off-Guard');
  });

  it('findet ausgeschlossene Namen nicht', () => {
    expect(index.find('friendly')).toBeUndefined();
    expect(index.find('confused')).toBeUndefined();
  });
});

describe('conditionUuid', () => {
  it('setzt den Verweis mit Item als Dokumenttyp', () => {
    const entry = index.find('prone')!;
    expect(conditionUuid(entry, 'prone')).toBe(
      '@UUID[Compendium.pf2e.conditionitems.Item.aaaaaaaaaaaaaaaa]{prone}',
    );
  });
});

describe('enrichConditions', () => {
  it('verlinkt eine Bedingung ohne Stufe', () => {
    expect(enrichConditions('The creature is knocked prone.', index)).toBe(
      'The creature is knocked @UUID[Compendium.pf2e.conditionitems.Item.aaaaaaaaaaaaaaaa]{prone}.',
    );
  });

  it('verlinkt eine Bedingung mit Stufe nur zusammen mit der Zahl', () => {
    expect(enrichConditions('the PC becomes sickened 2 and drained 1.', index)).toBe(
      'the PC becomes @UUID[Compendium.pf2e.conditionitems.Item.eeeeeeeeeeeeeeee]{sickened 2} and ' +
        '@UUID[Compendium.pf2e.conditionitems.Item.ffffffffffffffff]{drained 1}.',
    );
  });

  it('laesst eine Bedingung mit Stufe ohne Zahl in Ruhe', () => {
    // `dying` oder `wounded` allein sind im Fliesstext genauso oft
    // gewoehnliche Woerter wie die Bedingung.
    const text = 'She seemed frightened by the news.';
    expect(enrichConditions(text, index)).toBe(text);
  });

  it('verlinkt nur die Bedingung, wenn zufaellig eine Zahl folgt, die nicht zu ihr gehoert', () => {
    // `off-guard` traegt keine Stufe -- eine danebenstehende Zahl gehoert
    // nicht zur Bedingung und bleibt Text.
    expect(enrichConditions('is off-guard 2 rounds later', index)).toBe(
      'is @UUID[Compendium.pf2e.conditionitems.Item.bbbbbbbbbbbbbbbb]{off-guard} 2 rounds later',
    );
  });

  it('loest den alten Namen flat-footed im Text auf', () => {
    expect(enrichConditions('the target is flat-footed against this attack', index)).toBe(
      'the target is @UUID[Compendium.pf2e.conditionitems.Item.bbbbbbbbbbbbbbbb]{flat-footed} against this attack',
    );
  });

  it('laesst ausgeschlossene Namen unveraendert', () => {
    // `Friendly` und `Confused` sind echte Kompendiumsnamen, aber in der
    // Erzaehlprosa fast immer gewoehnliche Woerter.
    const text = 'He seemed friendly enough, if a little confused.';
    expect(enrichConditions(text, index)).toBe(text);
  });

  it('faengt sich nicht in einem bereits gesetzten Verweis', () => {
    const withLink =
      'a pair of @UUID[Compendium.pf2e.equipment-srd.Item.xxxxxxxxxxxxxxxx]{prone boots}, then knocked prone';
    expect(enrichConditions(withLink, index)).toBe(
      'a pair of @UUID[Compendium.pf2e.equipment-srd.Item.xxxxxxxxxxxxxxxx]{prone boots}, then knocked ' +
        '@UUID[Compendium.pf2e.conditionitems.Item.aaaaaaaaaaaaaaaa]{prone}',
    );
  });
});
