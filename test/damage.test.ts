import { describe, expect, it } from 'vitest';
import { enrichDamage } from '../src/pdf/damage.ts';

describe('enrichDamage', () => {
  it('macht aus Wuerfel und Schadensart einen wuerfelbaren Verweis', () => {
    expect(enrichDamage('takes 4d10 piercing damage')).toBe(
      'takes @Damage[4d10[piercing]] damage',
    );
  });

  it('nimmt den Zuschlag mit', () => {
    expect(enrichDamage('takes 2d8+7 bludgeoning damage with a save')).toBe(
      'takes @Damage[2d8+7[bludgeoning]] damage with a save',
    );
  });

  it('laesst eine Schadenskategorie in Ruhe', () => {
    // `precision` ist im System eine Kategorie, keine Art. `@Damage[1d4
    // [precision]]` waere kein Fehler, den Foundry zeigt, sondern ein leerer
    // Wurf — und der faellt erst am Spieltisch auf.
    const text = 'deals an additional 1d4 precision damage';
    expect(enrichDamage(text)).toBe(text);
  });

  it('laesst ein erfundenes Wort in Ruhe', () => {
    const text = 'takes 2d6 rostfrass damage';
    expect(enrichDamage(text)).toBe(text);
  });

  it('nimmt auch die blosse Zahl', () => {
    // Sturzschaden wird nicht gewuerfelt: `falls 20 feet to the floor below,
    // taking 10 bludgeoning damage`.
    expect(enrichDamage('taking 10 bludgeoning damage, but may')).toBe(
      'taking @Damage[10[bludgeoning]] damage, but may',
    );
  });

  it('reisst einen Wuerfelausdruck nicht am Zuschlag auseinander', () => {
    // Ohne den Wuerfel-Zweig zuerst wuerde `2d8+7 bludgeoning damage` bei der
    // `7` greifen und `2d8+` als Text stehenlassen.
    expect(enrichDamage('2d8+7 bludgeoning damage')).toBe('@Damage[2d8+7[bludgeoning]] damage');
  });

  it('setzt mehrere Angaben in einem Satz', () => {
    expect(enrichDamage('1d6 slashing damage, then 2d6 bludgeoning damage')).toBe(
      '@Damage[1d6[slashing]] damage, then @Damage[2d6[bludgeoning]] damage',
    );
  });

  it('braucht das Wort damage dahinter', () => {
    // `2d6 fire` allein ist eine Schadensangabe in einer Statblock-Zeile, und
    // die hat ihr eigenes Feld — hier wuerde der Verweis nur stoeren.
    const text = 'Damage 2d6 fire plus 1d4 persistent bleed';
    expect(enrichDamage(text)).toBe(text);
  });
});
