/**
 * Verknuepft Bedingungen (`Frightened`, `Off-Guard`, `Prone`, ...) im
 * Fliesstext mit dem Bedingungskompendium.
 *
 * Anders als bei Gegenstaenden gibt es hier **keine** Auszeichnung — Paizo
 * setzt eine Bedingung im Satz genauso wie jedes andere Wort (`becomes
 * sickened 2 and drained 1`, `is knocked prone`). Verglichen wird deshalb mit
 * einer festen Wortliste, die direkt aus dem Kompendium kommt: `isValued`
 * sagt, ob eine Bedingung eine Zahl traegt (`Frightened 2`) oder nicht
 * (`Prone`).
 */

/** Ein Eintrag aus `data/condition-index.json`. */
export interface ConditionEntry {
  /** Anzeigename, wie er im Kompendium steht. */
  name: string;
  /**
   * Volle Kennung des Kompendiums, wie `pack.collection` sie liefert —
   * `pf2e.equipment-srd`, nicht `equipment-srd`. Der Index entsteht zur
   * Laufzeit aus `game.packs`, und dort ist das die Kennung; ausserdem
   * funktionieren so Eintraege aus fremden Modulen.
   */
  pack: string;
  id: string;
  /** Traegt die Bedingung eine Stufe (`Frightened 2`)? */
  valued: boolean;
}

/** Der Verweis, wie FoundryVTT ihn im Journaltext erwartet. */
export function conditionUuid(entry: ConditionEntry, label: string): string {
  return `@UUID[Compendium.${entry.pack}.Item.${entry.id}]{${label}}`;
}

/**
 * Alte Namen, die im Kompendium nicht mehr eigenstaendig stehen, aber in
 * aelteren Jahrgaengen noch im Satz vorkommen. `flat-footed` heisst seit der
 * Regelueberarbeitung `off-guard` — beide meinen dieselbe Bedingung, und die
 * Season-1-Hefte schreiben noch die alte Form.
 */
const ALIASES: Record<string, string> = {
  'flat-footed': 'off-guard',
  'flat footed': 'off-guard',
};

/**
 * Ein Teil der Kompendiumsnamen ist ausserhalb des Regeltexts ein
 * gewoehnliches englisches Wort — `Friendly`, `Hostile`, `Hidden`,
 * `Controlled`, `Broken` beschreiben in der Erzaehlprosa fast immer eine
 * Stimmung oder eine Szene, nicht die Bedingung. Dazu kommen zwei, die auf
 * den ersten Blick eindeutig genug wirken, es aber nicht sind: `Confused`
 * beschreibt in aller Regel den Gesichtsausdruck einer Figur (*„looks
 * confused"*), nicht den Zustand; `Fleeing` steht fast immer fuer blosses
 * Weglaufen in der Erzaehlung (*„the fleeing pirates"*), nicht fuer die
 * erzwungene Bewegung der Bedingung. An allen Erwaehnungen dieser sieben
 * Woerter in den vier Season-8-Heften war **keine einzige** die Bedingung
 * gemeint. Diese Gruppe bleibt deshalb aussen vor, auch wenn das Kompendium
 * sie fuehrt.
 */
const EXCLUDED = new Set([
  'friendly',
  'hostile',
  'indifferent',
  'helpful',
  'unfriendly',
  'controlled',
  'hidden',
  'observed',
  'undetected',
  'unnoticed',
  'broken',
  'confused',
  'fleeing',
]);

function key(name: string): string {
  return name.toLowerCase();
}

export class ConditionIndex {
  readonly #byName: Map<string, ConditionEntry>;

  constructor(entries: readonly ConditionEntry[]) {
    this.#byName = new Map(
      entries.filter((entry) => !EXCLUDED.has(key(entry.name))).map((entry) => [key(entry.name), entry]),
    );
  }

  find(name: string): ConditionEntry | undefined {
    const normalised = key(name);
    return this.#byName.get(ALIASES[normalised] ?? normalised);
  }

  /** Fuer den Regex: alle bekannten Namen, laengste zuerst, damit `Off-Guard` vor `Off` gaebe (kaeme es vor). */
  names(): string[] {
    return [...this.#byName.keys(), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bereits gesetzter Verweis — fuer den Bedingungs-Durchlauf tabu, sonst verschachtelt sich ein `@UUID` im Label eines anderen. */
const PROTECTED = /@UUID\[[^\]]+\]\{[^}]*\}/g;

function enrichConditionsSegment(text: string, conditions: ConditionIndex): string {
  const names = conditions.names();
  if (names.length === 0) return text;

  const pattern = new RegExp(
    String.raw`\b(${names.map(escapeRegExp).join('|')})\b(\s+(\d+))?`,
    'gi',
  );

  return text.replace(pattern, (match, name: string, _stageGroup: string | undefined, stage: string | undefined) => {
    const entry = conditions.find(name);
    if (!entry) return match;
    if (entry.valued && stage === undefined) return match;
    if (!entry.valued && stage !== undefined) {
      // Die Zahl gehoert nicht zur Bedingung (`off-guard 2` gibt es nicht) --
      // nur die Bedingung selbst verlinken, die Zahl unangetastet lassen.
      return `${conditionUuid(entry, name)}${match.slice(name.length)}`;
    }
    const label = stage === undefined ? name : `${name} ${stage}`;
    return conditionUuid(entry, label);
  });
}

/**
 * Setzt die Kompendiumverweise der Bedingungen eines Textes.
 *
 * Eine Bedingung mit Stufe verlangt die Zahl **direkt danach** — ohne sie
 * bleibt der Ausdruck Text, denn `dying` oder `wounded` allein sind im
 * Fliesstext genauso oft gewoehnliche Woerter wie die Bedingung selbst. Die
 * Zahl allein ist aber ein starkes Signal: niemand schreibt „sickened 2“ in
 * gewoehnlicher Prosa.
 *
 * Laeuft nach den Gegenstandsverweisen: ein bereits gesetzter `@UUID`-Verweis
 * ist tabu, sonst koennte ein Wort im Label eines Gegenstands (z.B. eine
 * Bedingung im Namen eines Zaubers) einen zweiten, verschachtelten Verweis
 * bekommen.
 */
export function enrichConditions(text: string, conditions: ConditionIndex): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(PROTECTED)) {
    parts.push(enrichConditionsSegment(text.slice(last, match.index), conditions), match[0]);
    last = match.index + match[0].length;
  }
  parts.push(enrichConditionsSegment(text.slice(last), conditions));
  return parts.join('');
}
