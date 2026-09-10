import { describe, expect, it } from 'vitest';
import { klartext, leseKrankheit, sammleKrankheiten } from '../src/pdf/krankheiten.ts';
import type { Block, BlockRole } from '../src/pdf/types.ts';

// Erfunden, der Form des Krankheits-Statblocks nachgebildet — Wortlaut aus
// Paizo-Produkten steht in diesem Repo nicht (siehe `NOTICE.md`).
const block = (role: BlockRole, text: string, page = 11): Block =>
  ({ role, page, column: 0, text, lines: [] }) as Block;

const KOPF = 'RUSTLUNG DISEASE 4';
const PLAKETTE = 'DISEASE VIRULENT';
const WERTE =
  '*Some Rulebook* 12 **Saving Throw** DC 18 Fortitude; **Onset** 1 day; ' +
  '**Stage 1** enfeebled 1 (1 day); **Stage 2** enfeebled 2 and 1d6 poison damage (1 day); ' +
  '**Stage 3** enfeebled 3, off-guard, and 2d6 poison damage (1 hour)';

describe('leseKrankheit', () => {
  it('liest Kopfzeile, Plakette, Rettungswurf, Onset und Stufen', () => {
    const krankheit = leseKrankheit(KOPF, PLAKETTE, WERTE, 11)!;

    expect(krankheit.name).toBe('Rustlung');
    expect(krankheit.stufe).toBe(4);
    expect(krankheit.merkmale).toEqual(['disease', 'virulent']);
    expect(krankheit.rettungswurf).toEqual({ art: 'fortitude', dc: 18 });
    expect(krankheit.onset).toEqual({ wert: 1, einheit: 'days' });
    expect(krankheit.hoechstdauer).toBeUndefined();
    expect(krankheit.quelle).toBe('Some Rulebook');
    expect(krankheit.seite).toBe(11);
    expect(krankheit.stufen.map((stufe) => stufe.nummer)).toEqual([1, 2, 3]);
  });

  it('liest je Stufe Bedingungen, Schaden und Dauer', () => {
    const [eins, zwei, drei] = leseKrankheit(KOPF, PLAKETTE, WERTE, 11)!.stufen;

    expect(eins).toEqual({
      nummer: 1,
      text: 'enfeebled 1',
      bedingungen: [{ slug: 'enfeebled', wert: 1 }],
      schaden: [],
      dauer: { wert: 1, einheit: 'days' },
    });
    expect(zwei!.bedingungen).toEqual([{ slug: 'enfeebled', wert: 2 }]);
    expect(zwei!.schaden).toEqual([{ formel: '1d6', art: 'poison' }]);
    expect(drei!.bedingungen).toEqual([{ slug: 'enfeebled', wert: 3 }, { slug: 'off-guard' }]);
    expect(drei!.dauer).toEqual({ wert: 1, einheit: 'hours' });
  });

  it('liest eine Hoechstdauer', () => {
    const krankheit = leseKrankheit(
      KOPF,
      PLAKETTE,
      '**Saving Throw** DC 20 Fortitude; **Maximum Duration** 6 rounds; **Stage 1** 1d4 poison damage (1 round)',
      11,
    )!;
    expect(krankheit.hoechstdauer).toEqual({ wert: 6, einheit: 'rounds' });
    expect(krankheit.onset).toBeUndefined();
  });

  it('laesst eine Kopfzeile ohne Krankheit und einen Block ohne Rettungswurf aus', () => {
    expect(leseKrankheit('RUSTLUNG CREATURE 4', PLAKETTE, WERTE, 11)).toBeUndefined();
    expect(leseKrankheit(KOPF, PLAKETTE, 'Just some prose about a fever.', 11)).toBeUndefined();
  });
});

describe('klartext', () => {
  it('fuehrt Proben, Schaden und Verweise auf den gedruckten Wortlaut zurueck', () => {
    expect(
      klartext(
        '**Saving Throw** @Check[fortitude|dc:18|basic]; **Stage 2** ' +
          '@UUID[Compendium.pf2e.conditionitems.Item.xxxxxxxxxxxxxxxx]{enfeebled 2} and ' +
          '@Damage[1d6[poison]] damage (1 day)',
      ),
    ).toBe(
      '**Saving Throw** DC 18 Fortitude; **Stage 2** enfeebled 2 and 1d6 poison damage (1 day)',
    );
  });

  it('liest die Krankheit auch am angereicherten Text', () => {
    // So kommt der Werteblock beim Import an — die Anreicherung laeuft vor
    // dem Lesen. Am 11.09.2026 fiel die Krankheit deshalb still heraus.
    const krankheit = leseKrankheit(
      KOPF,
      PLAKETTE,
      '*Some Rulebook* 12 **Saving Throw** @Check[fortitude|dc:18]; **Onset** 1 day; ' +
        '**Stage 1** @UUID[Compendium.pf2e.conditionitems.Item.xxxxxxxxxxxxxxxx]{enfeebled 1} (1 day)',
      11,
    )!;
    expect(krankheit.rettungswurf).toEqual({ art: 'fortitude', dc: 18 });
    expect(krankheit.stufen[0]!.bedingungen).toEqual([{ slug: 'enfeebled', wert: 1 }]);
    expect(krankheit.text).toContain('DC 18 Fortitude');
  });
});

describe('sammleKrankheiten', () => {
  it('findet den Statblock im Blockstrom, jede Krankheit einmal', () => {
    const blocks = [
      block('body', 'Creatures who enter the water are exposed to rustlung.', 8),
      block('subheading', KOPF, 8),
      block('body', 'The encounter list names it, but prints no values here.', 8),
      block('box-heading', KOPF),
      block('traits', PLAKETTE),
      block('box', WERTE),
      block('box-heading', KOPF),
      block('traits', PLAKETTE),
      block('statblock', WERTE),
    ];

    const gefunden = sammleKrankheiten(blocks);
    expect(gefunden.map((krankheit) => krankheit.name)).toEqual(['Rustlung']);
    expect(gefunden[0]!.seite).toBe(11);
  });
});
