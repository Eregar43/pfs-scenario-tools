/**
 * Macht aus den Probenangaben des Fliesstextes FoundryVTT-Wuerfelproben.
 *
 * Im PDF steht `DC 15 Arcana check`, im Journal soll `@Check[arcana|dc:15]`
 * stehen — anklickbar statt abgetippt. Gesucht wird nur nach dem festen
 * Muster **`DC <Zahl> <Fertigkeit>`**; alles andere bleibt Text.
 *
 * Der Nachsatz bleibt stehen: aus `DC 15 Arcana check` wird
 * `@Check[arcana|dc:15] check`. Genau so halten es die offiziellen Journale
 * (`@Check[medicine|dc:18] check to patch them up`).
 *
 * **Je Fertigkeit eine eigene Probe.** Eine Aufzaehlung koennte man auch in
 * eine einzige Probe fassen (`@Check[crafting,thievery|dc:25]`) — Foundry
 * setzt daraus aber untereinanderstehende Knoepfe mit Luft dazwischen, und im
 * Blatt einer Gefahr reisst das den Satz auseinander. Am 14.08.2026 an
 * `Collapsing Balcony` und `Ghostly Ushers` in der Instanz gesehen. Getrennte
 * Proben stehen dagegen in der Zeile, und die Trenner des Hefts (`, `, ` or `)
 * bleiben dazwischen erhalten.
 */

/**
 * Die Fertigkeiten des Systems. `Perception` ist keine davon, wird aber
 * genauso gewuerfelt; `computers` und `piloting` gibt es nur in SF2e und
 * stoeren in PF2e nicht.
 */
const SKILLS = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Computers',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Piloting',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
  'Perception',
] as const;

/** Rettungswuerfe. `basic` davor gehoert als eigener Zusatz in die Probe. */
const SAVES = ['Fortitude', 'Reflex', 'Will'] as const;

/**
 * Wissensfertigkeiten heissen `<Etwas> Lore` und sind nicht aufzaehlbar —
 * jedes Szenario bringt eigene mit (`Bhopan Lore`, `Cayden Cailean Lore`).
 * Der Zweig steht **vor** den festen Namen, damit `Nature Lore` nicht nach
 * `Nature` zerfaellt.
 */
const LORE = String.raw`(?:[A-Z][A-Za-z’'-]*\s+)+Lore`;

const NAME = `(?:${LORE}|${[...SAVES, ...SKILLS].join('|')})`;

/**
 * Die Ausbildungsstufe, die Paizo hinter eine Fertigkeit setzt.
 *
 * Sie steht **zwischen** den Namen einer Aufzaehlung: `DC 25 Crafting
 * (trained) or Thievery (trained)`. Ohne sie im Muster endete die Aufzaehlung
 * beim ersten Namen, und die zweite Fertigkeit bliebe abgetippter Text —
 * genau so ist es dem Autor an einer Gefahr in der laufenden Instanz
 * aufgefallen.
 */
const STUFE = String.raw`(?:\s*\((?:untrained|trained|expert|master|legendary)\))?`;

/** `A`, `A or B`, `A, B, or C` — so zaehlt Paizo Alternativen auf. */
const NAME_LIST = `${NAME}${STUFE}(?:(?:\\s*,\\s*or\\s+|\\s*,\\s*|\\s+or\\s+)${NAME}${STUFE})*`;

const CHECK = new RegExp(String.raw`\bDC\s+(\d+)\s+(basic\s+)?(${NAME_LIST})`, 'g');

/** Trennt die Namen einer Aufzaehlung wieder auf — die Trenner bleiben stehen. */
const SEPARATOR = /(\s*,\s*or\s+|\s*,\s*|\s+or\s+)/;

/** `Crafting (trained)` → Name und Stufe getrennt. */
function teileStufe(stueck: string): { name: string; stufe?: string } {
  const treffer = /^(.*?)\s*\((untrained|trained|expert|master|legendary)\)\s*$/.exec(stueck.trim());
  return treffer ? { name: treffer[1]!, stufe: treffer[2]! } : { name: stueck.trim() };
}

const SAVE_SLUGS = new Set(SAVES.map((save) => save.toLowerCase()));

export function slugifySkill(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Setzt die Wuerfelproben eines Textes.
 *
 * `basic` gilt nur fuer Rettungswuerfe — bei einer Fertigkeit gibt es das
 * nicht, und ein danebengeratenes `|basic` waere im Journal ein falscher
 * Hinweis. Deshalb wird es nur uebernommen, wenn auch wirklich ein
 * Rettungswurf dasteht.
 */
export function enrichChecks(text: string, optionen: readonly string[] = []): string {
  return text.replace(CHECK, (match, dc: string, basic: string | undefined, list: string) => {
    // Die Trenner bleiben beim Zerlegen erhalten, damit die Aufzaehlung
    // hinterher mit ihren eigenen Worten wieder dasteht.
    const stuecke = list.split(SEPARATOR);
    const eintraege = stuecke.filter((_, i) => i % 2 === 0).map(teileStufe);
    const trenner = stuecke.filter((_, i) => i % 2 === 1);

    if (eintraege.every((eintrag) => slugifySkill(eintrag.name) === '')) return match;

    return eintraege
      .map((eintrag, i) => {
        const slug = slugifySkill(eintrag.name);
        const parts = [slug, `dc:${dc}`];
        if (basic && SAVE_SLUGS.has(slug)) parts.push('basic');
        // Wurf-Optionen der Probe. Sie tragen den Bonus einer Begegnung:
        // Der Effekt fragt sie in seinem `predicate` ab und wirkt nur hier.
        if (optionen.length > 0) parts.push(`options:${optionen.join(',')}`);
        const probe = `@Check[${parts.join('|')}]`;
        const mitStufe = eintrag.stufe ? `${probe} (${eintrag.stufe})` : probe;
        return i === 0 ? mitStufe : `${trenner[i - 1] ?? ' or '}${mitStufe}`;
      })
      .join('');
  });
}
