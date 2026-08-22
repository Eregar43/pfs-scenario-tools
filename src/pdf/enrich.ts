import { enrichChecks } from './checks.ts';
import { enrichDamage } from './damage.ts';
import { enrichConditions, type ConditionIndex } from './conditions.ts';
import { enrichItems, enrichPlainItems, type ItemIndex } from './items.ts';
import type { Scenario } from './scenario.ts';
import type { Block } from './types.ts';

/**
 * Anreicherung: aus Probenangaben, Gegenstaenden, Zaubern und Bedingungen im
 * Wortlaut des PDFs werden Foundry-Verweise.
 *
 * Die Reihenfolge ist zwingend — Proben, dann Gegenstaende, dann Bedingungen.
 * Jeder Durchlauf schuetzt, was die vorigen gesetzt haben; andersherum
 * verschachteln sich die Verweise ineinander.
 *
 * Herkunft: `src/emit.ts` des PaizoPFSScenarioTextExtractor.
 */

const PROSE_ROLES: ReadonlySet<Block['role']> = new Set(['body', 'box', 'statblock', 'check-result']);

/**
 * Legt eine Fassung des Szenarios an, in der die Probenangaben zu
 * `@Check[...]` geworden sind.
 *
 * Die Bloecke werden **kopiert**, nicht beschrieben: Fliesstext und
 * Kastendateien sollen den Wortlaut des PDFs behalten, und ein zweiter Aufruf
 * von `groupBoxes` darf keinen anderen Stand sehen.
 *
 * Ueberschriften bleiben aussen vor. Dort steht keine Probe, wohl aber die
 * Stufe einer Kreatur — und die soll die Kreatur nicht verlieren.
 *
 * `optionenJeSeite` haengt den Proben einer Heftseite Wurf-Optionen an. Damit
 * laesst sich ein Bonus auf **eine Begegnung** eingrenzen: Das Heft sagt „in
 * the chase on page 7", die Proben der Seite 7 bekommen die Option, und der
 * Effekt fragt sie ab. Ohne diesen Umweg gaebe es keine Eingrenzung — ein Wurf
 * traegt von sich aus kein Merkmal „Verfolgungsjagd".
 */
export function withChecks(
  scenario: Scenario,
  optionenJeSeite: ReadonlyMap<number, string[]> = new Map(),
): Scenario {
  return {
    ...scenario,
    blocks: scenario.blocks.map((block) =>
      PROSE_ROLES.has(block.role)
        ? { ...block, text: enrichChecks(block.text, optionenJeSeite.get(block.page) ?? []) }
        : block,
    ),
  };
}

/**
 * Legt eine Fassung an, in der `4d10 piercing damage` zu einem wuerfelbaren
 * `@Damage[...]` geworden ist.
 *
 * Laeuft direkt nach den Proben und vor allem Weiteren: Der Wuerfelausdruck
 * besteht aus Ziffern und Buchstaben, die kein anderer Durchlauf anfasst, und
 * umgekehrt steht in einem fertigen `@Damage[...]` nichts, was die spaeteren
 * Durchlaeufe suchen.
 */
export function withDamage(scenario: Scenario): Scenario {
  return {
    ...scenario,
    blocks: scenario.blocks.map((block) =>
      PROSE_ROLES.has(block.role) ? { ...block, text: enrichDamage(block.text) } : block,
    ),
  };
}

/**
 * Legt eine Fassung des Szenarios an, in der Gegenstaende und Zauber im
 * Fliesstext zu `@UUID[...]` geworden sind. Gesucht wird in denselben Rollen
 * wie bei den Proben — dort und nur dort steht Prosa, keine Ueberschrift.
 *
 * Zwei Durchlaeufe: `enrichItems` folgt der Kursivsetzung, mit der Paizo
 * magische Gegenstaende markiert. `enrichPlainItems` sucht danach im Rest des
 * Textes nach nicht-magischen Gegenstaenden (`ghost charge`, `lesser elixir
 * of life`), die ohne Auszeichnung bleiben und deshalb kein kursives Signal
 * hergeben.
 */
export function withItemLinks(scenario: Scenario, items: ItemIndex): Scenario {
  return {
    ...scenario,
    blocks: scenario.blocks.map((block) =>
      PROSE_ROLES.has(block.role)
        ? { ...block, text: enrichPlainItems(enrichItems(block.text, items), items) }
        : block,
    ),
  };
}

/**
 * Legt eine Fassung des Szenarios an, in der Bedingungen (`Frightened 2`,
 * `Off-Guard`) im Fliesstext zu `@UUID[...]` geworden sind. Anders als bei
 * Gegenstaenden gibt es dafuer keine Auszeichnung — Paizo setzt eine
 * Bedingung genauso wie jedes andere Wort. Laeuft deshalb zuletzt, nach den
 * Gegenstandsverweisen: ein bereits gesetzter Verweis ist fuer
 * `enrichConditions` tabu.
 */
export function withConditionLinks(scenario: Scenario, conditions: ConditionIndex): Scenario {
  return {
    ...scenario,
    blocks: scenario.blocks.map((block) =>
      PROSE_ROLES.has(block.role)
        ? { ...block, text: enrichConditions(block.text, conditions) }
        : block,
    ),
  };
}
