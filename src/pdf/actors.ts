/**
 * Verknuepft die Kreaturen eines Szenarios mit den Actors der PF2e-Kompendien.
 *
 * Gesucht wird nur an den **Statblock-Ueberschriften** (`Twigjack Creature 3`).
 * Nur dort steht neben dem Namen auch die Stufe, und erst die macht den Treffer
 * pruefbar: `Twigjack Creature 3` trifft den Twigjack aus dem Monster Core nur,
 * weil beide Stufe 3 sind. Eine Erwaehnung im Fliesstext traegt diese Probe
 * nicht und bliebe geraten.
 */
/** Kreatur oder Gefahr. Beides sind Actors, aber getrennte Namensraeume. */
export type ActorKind = 'creature' | 'hazard';

/** Ein Kompendiumeintrag, wie ihn `data/actor-index.json` fuehrt. */
export interface ActorEntry {
  /** Anzeigename, wie er im Kompendium steht. */
  name: string;
  /**
   * Volle Kennung des Kompendiums, wie `pack.collection` sie liefert —
   * `pf2e.equipment-srd`, nicht `equipment-srd`. Der Index entsteht zur
   * Laufzeit aus `game.packs`, und dort ist das die Kennung; ausserdem
   * funktionieren so Eintraege aus fremden Modulen.
   */
  pack: string;
  /** Foundry-Kennung des Actors. */
  id: string;
  /** Stufe; sie prueft den Treffer gegen die Ueberschrift. */
  level: number;
  kind: ActorKind;
}

/**
 * Paizos Statblockleiste: Name, Art, Stufe. Die Stufe kann negativ sein und
 * steht dann mit Gedankenstrich (`Weak Bodyguard Creature –1`).
 *
 * `Hazard` steht gleichberechtigt neben `Creature` und `NPC`: Fallen und
 * Spukorte sind genauso gesetzt (`Collapsing Balcony Hazard 5`). Sie bekommen
 * ihren eigenen Verweis — Gefahren sind in Foundry ebenfalls Actors, nur in
 * anderen Kompendien.
 */
const STATBLOCK_HEADING = /^(.*?)\s+(Creature|NPC|Hazard)\s+([–—-]?\s*\d+)$/;

/**
 * Anzahl hinter dem Namen: `Wight (2)`, `Animated Brooms (3)`. Sie sagt, wie
 * oft die Kreatur in der Begegnung steht, und gehoert nicht zum Namen.
 */
const COUNT_SUFFIX = /\s*\(\d+\)\s*$/;

/**
 * Elite und Schwach sind angepasste Fassungen derselben Kreatur. Der Verweis
 * zeigt auf die unangepasste im Kompendium, das Wort davor bleibt Text —
 * `Elite @UUID[...]{Sprigjack} Creature 1`.
 */
const ADJUSTED = /^(Elite|Weak)\s+(.+)$/i;

export type Adjustment = 'elite' | 'weak';

/**
 * Die Stufe einer angepassten Fassung, wie das PF2e-System sie rechnet
 * (`src/module/actor/npc/document.ts`):
 *
 * - Elite: eine Stufe hoeher; steht die Kreatur unter Stufe 1, zwei hoeher.
 * - Schwach: eine Stufe tiefer; steht sie auf genau Stufe 1, zwei tiefer.
 *
 * Damit bleibt die Stufe auch hier die Probe: `Elite Sprigjack Creature 1`
 * trifft den Sprigjack (Stufe −1), weil −1 angepasst 1 ergibt.
 */
export function adjustedLevel(base: number, adjustment: Adjustment): number {
  if (adjustment === 'elite') return base < 1 ? base + 2 : base + 1;
  return base === 1 ? base - 2 : base - 1;
}

export interface ActorLink {
  /** Der Name, der zum Verweis wird. */
  label: string;
  /** Was in der Ueberschrift davor steht — etwa `Elite `. */
  before: string;
  /** Was dahinter steht — Anzahl, Art und Stufe. */
  after: string;
  entry: ActorEntry;
  /** Gesetzt, wenn die Ueberschrift eine angepasste Fassung nennt. */
  adjustment?: Adjustment;
  /**
   * Abweichendes Verweisziel. Ohne Angabe zeigt der Verweis auf den
   * Kompendiumseintrag; die Welt-Verweise setzen hier `Actor.<id>`.
   */
  uuid?: string;
}

/** Was eine Suche koennen muss, um Verweise zu setzen. */
export interface ActorSuche {
  find(heading: string): ActorLink | undefined;
}

/** Was eine Ueberschrift ueber ihre Kreatur verraet. */
export interface CreatureHeading {
  /** Name ohne Art und Stufe, aber mit einer etwaigen Anzahl. */
  name: string;
  level: number;
  /** Art und Stufe im Wortlaut der Ueberschrift (` Creature –1`). */
  suffix: string;
  /** Die Art, wie die Leiste sie nennt — `hazard` bekommt keinen Verweis. */
  kind: 'creature' | 'npc' | 'hazard';
}

export function parseCreatureHeading(heading: string): CreatureHeading | undefined {
  const trimmed = heading.trim();
  const match = STATBLOCK_HEADING.exec(trimmed);
  if (!match) return undefined;
  const level = Number(match[3]!.replace(/[–—]/, '-').replace(/\s+/g, ''));
  if (!Number.isInteger(level)) return undefined;
  const name = match[1]!;
  const kind = match[2]!.toLowerCase() as CreatureHeading['kind'];
  return { name: name.trim(), level, suffix: trimmed.slice(name.length), kind };
}

/**
 * Fuehrt einen Namen auf die Einzahl zurueck. Paizo zaehlt die Kreaturen einer
 * Begegnung im Plural (`Animated Brooms (3)`), das Kompendium fuehrt sie
 * einzeln (`Animated Broom`). Gebeugt wird nur das **letzte** Wort.
 */
export function singularise(name: string): string[] {
  const match = /^(.*?)(\p{L}+)$/u.exec(name);
  if (!match) return [];
  const [, before = '', last = ''] = match;

  const forms: string[] = [];
  if (/ies$/i.test(last)) forms.push(`${before}${last.slice(0, -3)}y`);
  if (/(ches|shes|sses|xes|zes)$/i.test(last)) forms.push(`${before}${last.slice(0, -2)}`);
  if (/ves$/i.test(last)) forms.push(`${before}${last.slice(0, -3)}f`, `${before}${last.slice(0, -3)}fe`);
  if (/s$/i.test(last) && !/ss$/i.test(last)) forms.push(`${before}${last.slice(0, -1)}`);

  return forms;
}

function key(kind: ActorKind, name: string): string {
  return `${kind}|${name.toLowerCase()}`;
}

export class ActorIndex {
  readonly #byName: Map<string, ActorEntry>;

  constructor(entries: readonly ActorEntry[]) {
    // Kreaturen und Gefahren stehen in getrennten Namensraeumen. Ohne die Art
    // im Schluessel bekaeme `Green Slime Hazard 9` den Verweis auf eine
    // gleichnamige Kreatur, sobald es sie einmal gibt.
    this.#byName = new Map(entries.map((entry) => [key(entry.kind, entry.name), entry]));
  }

  /**
   * Sucht den Actor zu einer Statblock-Ueberschrift.
   *
   * Kein Treffer heisst nicht "fehlt", sondern meistens: die Kreatur ist
   * szenarioeigen (`Captain Ashfell Grimme`) oder eine benannte Fassung einer
   * bekannten (`Burr`, ein Elite-Twigjack). Beides gehoert nicht ans
   * Grundwerk-Kompendium verwiesen — auch `Burr` nicht, denn der Verweis
   * zeigte sonst auf einen gewoehnlichen Twigjack.
   */
  find(heading: string): ActorLink | undefined {
    const parsed = parseCreatureHeading(heading);
    if (!parsed) return undefined;
    // `Creature` und `NPC` sind beide gewoehnliche Actors; nur die Gefahr
    // liegt in eigenen Kompendien und darf sich mit keiner Kreatur verwechseln.
    const kind: ActorKind = parsed.kind === 'hazard' ? 'hazard' : 'creature';

    const withoutCount = parsed.name.replace(COUNT_SUFFIX, '').trim();
    if (withoutCount === '') return undefined;
    // Anzahl und Stufe stehen hinter dem Namen und bleiben Text.
    const trailing = parsed.name.slice(withoutCount.length) + parsed.suffix;

    // `Elite Sprigjack` verweist auf den Sprigjack; das Wort davor bleibt
    // stehen, damit die Anpassung in der Leiste sichtbar bleibt.
    const adjusted = ADJUSTED.exec(withoutCount);
    const adjustment = adjusted
      ? (adjusted[1]!.toLowerCase() as Adjustment)
      : undefined;
    const label = adjusted ? adjusted[2]!.trim() : withoutCount;
    const before = withoutCount.slice(0, withoutCount.length - label.length);

    for (const candidate of [label, ...singularise(label)]) {
      const entry = this.#byName.get(key(kind, candidate));
      if (!entry) continue;
      // Die Stufe ist die Probe: sie trennt die Kreatur aus dem Grundwerk von
      // einer gleichnamigen, fuer das Szenario angepassten Fassung. Bei Elite
      // und Schwach wird gegen die **angepasste** Stufe geprueft.
      const expected = adjustment ? adjustedLevel(entry.level, adjustment) : entry.level;
      if (expected === parsed.level) {
        return { label, before, after: trailing, entry, adjustment };
      }
    }

    return undefined;
  }

  /**
   * Sucht eine Vorlage allein ueber den Namen — **ohne** Stufenprobe.
   *
   * Fuer Varianten ist das richtig so: `Variant pirate` auf Stufe 2 zeigt
   * ausdruecklich auf den Piraten aus dem Grundwerk, dessen Stufe eine andere
   * ist. Die Probe ersetzt hier die Quellenzeile selbst, die Buch und
   * Fundstelle nennt.
   */
  findeNachName(kind: ActorKind, name: string): ActorEntry | undefined {
    for (const candidate of [name, ...singularise(name)]) {
      const entry = this.#byName.get(key(kind, candidate));
      if (entry) return entry;
    }
    return undefined;
  }
}

/** Eine Kreatur der Welt, wie die Welt-Verweise sie kennen muessen. */
export interface WeltKreatur {
  /** Voller Name der Fassung — `Weak Bodyguard`, `Captain Ashfell Grimme`. */
  name: string;
  stufe: number;
  art: ActorKind;
  /** Verweisziel, `Actor.<id>`. */
  uuid: string;
}

/**
 * Verweise auf die **Welt-Actors** des Szenarios statt auf die Kompendien.
 *
 * Aufgeloest wird ueber Name und Stufe der Kopfzeile — beides stammt aus
 * derselben Sammlung, die auch die Actors anlegt, deshalb reicht der
 * woertliche Vergleich. Elite und Varianten stehen mit ihrem vollen Namen
 * in der Liste; anders als beim Kompendium wird nichts abgeschnitten.
 */
export class WeltActorSuche implements ActorSuche {
  readonly #nachName: Map<string, WeltKreatur>;

  constructor(kreaturen: readonly WeltKreatur[]) {
    this.#nachName = new Map(
      kreaturen.map((kreatur) => [
        `${kreatur.art}|${kreatur.name.toLowerCase()}|${kreatur.stufe}`,
        kreatur,
      ]),
    );
  }

  find(heading: string): ActorLink | undefined {
    const parsed = parseCreatureHeading(heading);
    if (!parsed) return undefined;
    const kind: ActorKind = parsed.kind === 'hazard' ? 'hazard' : 'creature';

    const label = parsed.name.replace(COUNT_SUFFIX, '').trim();
    if (label === '') return undefined;
    const trailing = parsed.name.slice(label.length) + parsed.suffix;

    // Auch die Mehrzahl der Kopfzeile findet ihren Actor: `Animated Brooms`
    // in der Zeile, `Animated Broom` in der Welt.
    for (const candidate of [label, ...singularise(label)]) {
      const kreatur = this.#nachName.get(`${kind}|${candidate.toLowerCase()}|${parsed.level}`);
      if (!kreatur) continue;
      return {
        label,
        before: '',
        after: trailing,
        entry: { name: kreatur.name, pack: '', id: '', level: kreatur.stufe, kind },
        uuid: kreatur.uuid,
      };
    }

    return undefined;
  }
}

/** Der Verweis, wie FoundryVTT ihn im Journaltext erwartet. */
export function actorUuid(link: ActorLink): string {
  const ziel = link.uuid ?? `Compendium.${link.entry.pack}.Actor.${link.entry.id}`;
  return `@UUID[${ziel}]{${link.label}}`;
}

/**
 * Die Quellenzeile am Anfang eines Statblocks, unter Name und Merkmalen.
 * Drei Formen sind belegt:
 *
 * - `*Pathfinder NPC Core* 66` — die blosse Fundstelle,
 * - `Variant pirate (*Pathfinder NPC Core* 147)` — eine Wortgruppe vor der
 *   Fundstelle nennt die **Vorlage**; das erste Wort kann auch `Female`,
 *   `Elite` oder etwas anderes sein (`Female totenmaske`, `Elite twigjack`),
 * - `Elite twigjack, page 12` — der Kurzverweis in der Begegnungsliste,
 *   ohne Buch (ein blosses `Page 12` nennt keine Vorlage und zaehlt nicht).
 *
 * Ueber die Vorlage kommen auch szenarioeigene Kreaturen an ihre Werte — die
 * Vorlage wird kopiert und traegt dann den Namen des Statblocks.
 */
const FUNDSTELLE = /^\*([^*]+)\*\s+\d/;
const VORLAGE_MIT_BUCH = /^([A-Za-z][^*()]*?)\s*\(\*([^*]+)\*\s*\d/;
const VORLAGE_MIT_SEITE = /^([A-Za-z][^,*]*?),\s*page\s+\d+/i;

export interface Quellenzeile {
  /**
   * Wortgruppe, die die Vorlage nennt — samt Beiwort (`Variant pirate`,
   * `Female totenmaske`). Aufgeloest wird sie wortweise, siehe
   * `loeseVorlage`.
   */
  vorlage?: string;
  /** Titel des Buchs, wenn die Zeile eine Fundstelle traegt. */
  buch?: string;
}

export function parseQuelle(text: string): Quellenzeile | undefined {
  const fundstelle = FUNDSTELLE.exec(text);
  if (fundstelle) return { buch: fundstelle[1]!.trim() };
  const mitBuch = VORLAGE_MIT_BUCH.exec(text);
  if (mitBuch) return { vorlage: mitBuch[1]!.trim(), buch: mitBuch[2]!.trim() };
  const mitSeite = VORLAGE_MIT_SEITE.exec(text);
  if (mitSeite) return { vorlage: mitSeite[1]!.trim() };
  return undefined;
}

const ANPASSUNGSWORT: Record<string, Adjustment> = { elite: 'elite', weak: 'weak' };

/**
 * Loest die Vorlagen-Wortgruppe einer Quellenzeile auf.
 *
 * Die Gruppe wird wortweise von links gekuerzt, bis der Rest im Index
 * steht: `Variant pirate` → `pirate`, `Female totenmaske` → `totenmaske`.
 * Faellt dabei ein `Elite` oder `Weak`, wird es zur Anpassung —
 * `Elite twigjack` unter der Kopfzeile `Burr` heisst: ein Twigjack, elite
 * gestellt, mit Namen Burr.
 */
export function loeseVorlage(
  vorlage: string,
  kind: ActorKind,
  index: ActorIndex,
): { entry: ActorEntry; anpassung?: Adjustment } | undefined {
  const woerter = vorlage.replace(/\s+/g, ' ').trim().split(' ');
  let anpassung: Adjustment | undefined;

  for (let start = 0; start < woerter.length; start++) {
    if (start > 0) {
      const gestrichen = ANPASSUNGSWORT[woerter[start - 1]!.toLowerCase()];
      if (gestrichen) anpassung = gestrichen;
    }
    const entry = index.findeNachName(kind, woerter.slice(start).join(' '));
    if (entry) return { entry, ...(anpassung ? { anpassung } : {}) };
  }

  return undefined;
}
