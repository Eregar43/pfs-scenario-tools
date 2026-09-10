/**
 * Verknuepft Gegenstaende und Zauber im Fliesstext mit den Items der
 * PF2e-Kompendien.
 *
 * Anders als bei Kreaturen gibt es keine feste Statblockleiste, an der ein
 * Gegenstand steht — er steht einfach kursiv im Satz (`*arboreal boots*`,
 * `*minor healing potion*`), unter ganz verschiedenen Ueberschriften
 * (`Treasure:`, `Mission Gear:`, `Creatures:`, `Development:` ...). Gesucht
 * wird deshalb nicht an einer Ueberschrift, sondern an jedem kursiven Lauf.
 */

export type ItemKind = 'equipment' | 'spell';

/** Ein Kompendiumeintrag, wie ihn `data/item-index.json` fuehrt. */
export interface ItemEntry {
  /** Anzeigename, wie er im Kompendium steht. */
  name: string;
  /**
   * Volle Kennung des Kompendiums, wie `pack.collection` sie liefert —
   * `pf2e.equipment-srd`, nicht `equipment-srd`. Der Index entsteht zur
   * Laufzeit aus `game.packs`, und dort ist das die Kennung; ausserdem
   * funktionieren so Eintraege aus fremden Modulen.
   */
  pack: string;
  /** Foundry-Kennung des Items. */
  id: string;
  kind: ItemKind;
}

export interface ItemLink {
  /** Der Name, der zum Verweis wird — im Wortlaut des PDFs. */
  label: string;
  /** Was davor steht und Text bleibt — etwa eine Rune (`+1 `) oder `scroll of `. */
  before: string;
  entry: ItemEntry;
}

/**
 * Fuehrt ein einzelnes Wort auf eine plausible Einzahl zurueck.
 *
 * Muss nicht linguistisch korrekt sein — nur stabil: dieselbe Funktion laeuft
 * ueber Kompendiumsnamen wie ueber den PDF-Text, ein falsch gestutztes Wort
 * trifft sich also trotzdem selbst.
 */
function singulariseWord(word: string): string {
  if (/ies$/.test(word) && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Bildet einen Namen auf einen wortordnungs- und zahlunabhaengigen Schluessel
 * ab: klein geschrieben, ohne Satzzeichen, jedes Wort einzeln auf die Einzahl
 * zurueckgefuehrt, die Woerter alphabetisch sortiert.
 *
 * Der Grund: Paizos Prosa setzt die Steigerungsstufe vor den Grundbegriff
 * (`minor healing potion`, `agate ellipsoid aeon stone`), das Kompendium
 * dahinter (`Healing Potion (Minor)`, `Aeon Stone (Agate Ellipsoid)`). Ein
 * hartcodiertes Woerterbuch der Steigerungsstufen waere Handarbeit und
 * muesste bei jedem neuen Suffix nachgepflegt werden. Die Probe an allen 5739
 * Ausruestungs- und 1993 Zaubernamen des Kompendiums: null Kollisionen.
 */
export function canonicalise(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[’'()]/g, '')
    .match(/[a-z0-9]+/g);
  if (!words) return '';
  return words.map(singulariseWord).sort().join(' ');
}

/** `+1 Scimitar`, `+2 Chain Shirt` — die Rune bleibt Text, die Waffe wird gesucht. */
const RUNE_PREFIX = /^([+-]\d+\s+)(.+)$/;

/**
 * `scroll of X`, `wand of X`, `staff of X` — dafuer gibt es im Kompendium nur
 * eine Blanko-Schriftrolle ohne Zauber. Verwiesen wird stattdessen auf den
 * Zauber selbst; der Rang, der im Text davorstehen kann (`3rd-rank scroll of
 * ...`), gehoert nicht zu diesem Ausdruck und bleibt ohnehin aussen vor.
 */
const SPELL_VESSEL = /^(scrolls?|wands?|staffs?|staves)(\s+of\s+)(.+)$/i;

function key(kind: ItemKind, name: string): string {
  return `${kind}|${canonicalise(name)}`;
}

export class ItemIndex {
  readonly #byKey: Map<string, ItemEntry>;

  constructor(entries: readonly ItemEntry[]) {
    this.#byKey = new Map(entries.map((entry) => [key(entry.kind, entry.name), entry]));
  }

  #lookup(kind: ItemKind, phrase: string): ItemEntry | undefined {
    const canon = canonicalise(phrase);
    if (canon === '') return undefined;
    return this.#byKey.get(`${kind}|${canon}`);
  }

  /**
   * Sucht den Gegenstand oder Zauber zu einem kursiven Ausdruck.
   *
   * Kein Treffer heisst meistens: der Ausdruck ist kein Gegenstand
   * (`*Perception*`, ein Name) oder ein szenarioeigenes Unikat
   * (`*brass compass*`) — beides gehoert nicht verwiesen.
   */
  find(candidate: string): ItemLink | undefined {
    const trimmed = candidate.trim();
    if (trimmed === '') return undefined;

    const direct = this.#lookup('equipment', trimmed);
    if (direct) return { label: trimmed, before: '', entry: direct };

    const runed = RUNE_PREFIX.exec(trimmed);
    if (runed) {
      const [, prefix, rest] = runed;
      const base = this.#lookup('equipment', rest!);
      if (base) return { label: rest!, before: prefix!, entry: base };
    }

    const vessel = SPELL_VESSEL.exec(trimmed);
    if (vessel) {
      const [, word, of, spellName] = vessel;
      const spell = this.#lookup('spell', spellName!);
      if (spell) return { label: spellName!, before: `${word}${of}`, entry: spell };
    }

    return undefined;
  }
}

/** Der Verweis, wie FoundryVTT ihn im Journaltext erwartet. */
export function itemUuid(link: ItemLink): string {
  return `@UUID[Compendium.${link.entry.pack}.Item.${link.entry.id}]{${link.label}}`;
}

/**
 * Kursiver Lauf, kein Fettdruck: ein einzelner Stern, nicht von einem
 * weiteren umgeben. `**Treasure:**` bleibt so unangetastet, `*arboreal
 * boots*` wird gefunden.
 */
const ITALIC = /(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)/g;

/**
 * Setzt die Kompendiumverweise eines Textes.
 *
 * Anders als bei `enrichChecks` steht das Muster nicht fest — jeder kursive
 * Lauf ist ein Kandidat. Ein Treffer bleibt weiterhin kursiv, nur der
 * verlinkbare Teil wird zum `@UUID`.
 */
export function enrichItems(text: string, items: ItemIndex): string {
  return text.replace(ITALIC, (match, phrase: string) => {
    const link = items.find(phrase);
    if (!link) return match;
    return `*${link.before}${itemUuid(link)}*`;
  });
}

/**
 * Bereits verlinkter oder kursiv gesetzter (aber unentschiedener) Text — fuer
 * `enrichPlainItems` tabu, damit ein unentschiedenes `*brass compass*`
 * nicht als blosses Wortpaar erneut versucht wird und ein gesetzter Verweis
 * nicht ein zweites Mal angefasst wird.
 */
const PROTECTED = new RegExp(String.raw`@UUID\[[^\]]+\]\{[^}]*\}|${ITALIC.source}`, 'g');

const WORD = /[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu;

/** Laengster Gegenstandsname im Kompendium: 7 Woerter, mit einem einzigen Ausreisser bei 11. */
const MAX_WINDOW = 7;

/**
 * Paizo setzt magische Gegenstaende kursiv — das ist das Signal, dem
 * `enrichItems` folgt. Ein nicht-magischer Gegenstand (`ghost charge`, `lesser
 * elixir of life`) bekommt dagegen **keine** Auszeichnung und faellt durch.
 * Ein einzelnes Wort bleibt trotzdem aussen vor: zu viele Grundgegenstaende
 * heissen `Dagger`, `Torch`, `Rope` und waeren als blosses Wort im Fliesstext
 * geraten, nicht gefunden.
 */
const MIN_WORDS = 2;

/**
 * Fuellwoerter, die fuer sich kein Signal sind. `The Keep`, `The Theater` und
 * `The Crows` sind echte Kompendiumsgegenstaende — aber „the" plus ein
 * gewoehnliches Substantiv kommt in jeder Erzaehlung vor, die zufaellig davon
 * handelt: `For the Love of Vanity` spielt in einem Theater, und „the
 * theater" waere sonst auf jeder zweiten Seite verlinkt worden. Verlangt
 * werden deshalb mindestens zwei Woerter, die **keine** Fuellwoerter sind.
 */
const FILLER = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'for',
  'to',
  'in',
  'on',
  'at',
  'with',
  'from',
]);

/** Kleinster Sinnkern, den ein Klartext-Treffer tragen muss. */
const MIN_CONTENT_WORDS = 3;

/**
 * Ein Kompendiumsname mit Klammerzusatz — `Antidote (Moderate)`, `Antiplague
 * (Lesser)` — ist ein Verbrauchsgut in Stufen. Paizo schreibt die Stufe
 * davor (`moderate antidote`), und das sind nur zwei Sinnwoerter: zu wenig
 * fuer die Drei-Wort-Regel, obwohl die Wortfolge in Prosa nie zufaellig
 * steht. In 8-06 blieben so `moderate antidote` und `moderate antiplague`
 * der Missionsausruestung ohne Verweis. Fuer solche Namen genuegen zwei.
 */
const MIN_CONTENT_WORDS_GRADED = 2;
const GRADED = /\(/;

function contentWords(words: readonly string[]): number {
  return words.filter((word) => !FILLER.has(word.toLowerCase())).length;
}

function tokenise(text: string): { words: string[]; gaps: string[] } {
  const words: string[] = [];
  const gaps: string[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD)) {
    gaps.push(text.slice(last, match.index));
    words.push(match[0]);
    last = match.index + match[0].length;
  }
  gaps.push(text.slice(last));
  return { words, gaps };
}

/**
 * Sucht in einem ungeschuetzten Textstueck nach nicht ausgezeichneten
 * Gegenstandsnamen — laengster Treffer zuerst, damit `lesser elixir of life`
 * nicht schon bei `elixir of life` abbricht.
 *
 * Nur direkte Treffer zaehlen: die Rune (`+1 Scimitar`) und die
 * Zauber-Vehikel (`scroll of ...`) sind selbst magisch und stehen deshalb
 * ohnehin kursiv — dafuer ist `enrichItems` zustaendig. Zauber bleiben hier
 * ebenfalls aussen vor; ein zufaellig passendes Wortpaar in der Erzaehlung
 * waere sonst zu leicht ein falscher Treffer.
 */
function enrichPlainSegment(text: string, items: ItemIndex): string {
  const { words, gaps } = tokenise(text);
  const parts: string[] = [gaps[0] ?? ''];
  let i = 0;

  while (i < words.length) {
    let link: ItemLink | undefined;
    let span = 0;
    const longest = Math.min(MAX_WINDOW, words.length - i);
    for (let candidate = longest; candidate >= MIN_WORDS; candidate--) {
      const slice = words.slice(i, i + candidate);
      if (contentWords(slice) < MIN_CONTENT_WORDS_GRADED) continue;
      const found = items.find(slice.join(' '));
      if (!found || found.before !== '' || found.entry.kind !== 'equipment') continue;
      const noetig = GRADED.test(found.entry.name) ? MIN_CONTENT_WORDS_GRADED : MIN_CONTENT_WORDS;
      if (contentWords(slice) < noetig) continue;
      link = found;
      span = candidate;
      break;
    }

    if (link) {
      let original = words[i]!;
      for (let k = 1; k < span; k++) original += gaps[i + k]! + words[i + k]!;
      parts.push(itemUuid({ ...link, label: original }), gaps[i + span] ?? '');
      i += span;
    } else {
      parts.push(words[i]!, gaps[i + 1] ?? '');
      i += 1;
    }
  }

  return parts.join('');
}

/**
 * Setzt die Kompendiumverweise nicht-magischer Gegenstaende — ohne die
 * Kursivsetzung, die `enrichItems` sonst voraussetzt. Laeuft nach
 * `enrichItems`: was dort schon verlinkt oder als kursiver Lauf unentschieden
 * blieb, wird hier uebersprungen, nicht ein zweites Mal versucht.
 */
export function enrichPlainItems(text: string, items: ItemIndex): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(PROTECTED)) {
    parts.push(enrichPlainSegment(text.slice(last, match.index), items), match[0]);
    last = match.index + match[0].length;
  }
  parts.push(enrichPlainSegment(text.slice(last), items));
  return parts.join('');
}
