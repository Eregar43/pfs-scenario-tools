import { groupBoxes, type BoxDocument } from './boxes.ts';
import { DEGREE_LABEL } from './roles.ts';
import { sha256OfText } from './sha256.ts';
import {
  actorUuid,
  loeseVorlage,
  parseCreatureHeading,
  parseQuelle,
  type ActorEntry,
  type ActorIndex,
  type ActorKind,
  type ActorSuche,
  type Adjustment,
} from './actors.ts';
import { leseStatblockAn, type Statblock } from './statblock.ts';
import { titleCase } from './text.ts';
import type { Scenario } from './scenario.ts';
import type { Block } from './types.ts';

/**
 * Baut aus den erkannten Bloecken ein FoundryVTT-Journal.
 *
 * Die Struktur ist einem von Hand gebauten Journal desselben Szenarios
 * abgeschaut — es ist die einzige Quelle dafuer, wie ein Mensch diesen Stoff
 * gliedert. Uebernommen sind daraus:
 *
 * - eine Journalseite je Ueberschrift, mit `<hN data-split-here>` im Inhalt
 *   und `title.show: false`,
 * - `<blockquote class="read-aloud">` fuer Vorlesetext ohne Titel — das ist
 *   FoundryVTTs eigene Auszeichnung dafuer; die Klasse benennt die Textsorte
 *   wie in den offiziellen Journalen, gestaltet wird inline,
 * - `<div class="statblock">` fuer die Kreaturenleiste samt ihrem Verweis,
 * - `<aside class="sidebar float-right">` fuer Kaesten mit **mittigem** Titel,
 *   waehrend ein Eintrag mit buendigem Titel (`INTO THE DRINK OBSTACLE 1`) als
 *   `<h3>` an seiner Stelle im Fliesstext bleibt,
 * - `<div class="action">` samt `<ul class="traits">` fuer Aktivitaeten,
 * - `<section class="action">` mit `<p class="hanging-indent">` fuer
 *   Probenergebnisse.
 *
 * `@Check[...]` und `@UUID[...]` stehen nur in der angereicherten Fassung
 * (`journal_angereichert.json`); die schlichte bleibt beim Wortlaut des PDFs.
 */

const FOUNDRY_ID_LENGTH = 16;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Erste Seite im Beispieljournal; die weiteren folgen in 100er-Schritten. */
const FIRST_SORT = 500;
const SORT_STEP = 100;

/**
 * Kennungen werden aus dem Namen abgeleitet statt gewuerfelt, damit zwei
 * Laeufe dieselbe Datei ergeben und sich Aenderungen diffen lassen.
 */
export function foundryId(seed: string): string {
  const digest = sha256OfText(seed);
  let id = '';
  for (let i = 0; i < FOUNDRY_ID_LENGTH; i++) {
    id += ID_ALPHABET[digest[i]! % ID_ALPHABET.length];
  }
  return id;
}

/**
 * Stabile Kennung einer Journalseite in der **Welt**: Name plus Zaehlung
 * gleicher Namen, ohne die Position.
 *
 * Die alte Ableitung ueber die laufende Nummer verschob bei jeder
 * eingefuegten Seite die Kennungen aller folgenden — der Abgleich legte dann
 * faelschlich alles neu an, und Verweise auf die Seiten rissen. Mit dem
 * Namen als Samen bleibt jede Seite stabil, solange sie ihren Namen behaelt;
 * gleichnamige Seiten zaehlen in Lesereihenfolge durch.
 *
 * Die heruntergeladene `journal.json` behaelt dagegen die alte Ableitung
 * (`buildJournal`) — sie soll zeichengleich mit der des Extractors bleiben.
 */
export function seitenKennung(titel: string, name: string, nth: number): string {
  return foundryId(`${titel}/seite/${nth}/${name}`);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Uebersetzt die Auszeichnung aus dem Markdown-Zwischenstand nach HTML.
 * Reihenfolge: erst fett, dann kursiv, sonst frisst `*` die Sternpaare auf.
 */
export function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Absaetze eines Markdown-Blocks als `<p>`; leere Teile fallen weg. */
export function paragraphs(text: string, className?: string): string[] {
  const attribute = className ? ` class="${className}"` : '';
  return text
    .split('\n\n')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => `<p${attribute}>${inlineHtml(part)}</p>`);
}

/** Probenergebnisse: je Erfolgsstufe ein haengend eingezogener Absatz. */
function checkResultHtml(text: string): string {
  const entries = text.split(/(?=\*\*(?:Critical Success|Critical Failure|Success|Failure)\*\*)/);
  const lines: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    lines.push(
      DEGREE_LABEL.test(trimmed)
        ? `  <p class="hanging-indent">${inlineHtml(trimmed)}</p>`
        : `  <p>${inlineHtml(trimmed)}</p>`,
    );
  }

  return ['<section class="action">', ...lines, '</section>'].join('\n');
}

/** Merkmalsplaketten stehen im Journal als kleingeschriebene Liste. */
function traitsHtml(text: string, indent: string): string {
  const traits = text
    .split(/\s+/)
    .map((trait) => trait.trim().toLowerCase())
    .filter((trait) => trait !== '');

  return [
    `${indent}<ul class="traits">`,
    ...traits.map((trait) => `${indent}  <li class="trait">${escapeHtml(trait)}</li>`),
    `${indent}</ul>`,
  ].join('\n');
}

/** Die Teile eines Kastens unterhalb seines Titels, jeweils als HTML-Zeilen. */
function boxParts(parts: Block[], indent: string, className?: string): string[] {
  return parts.flatMap((part) => {
    if (part.role === 'traits') return [traitsHtml(part.text, indent)];
    if (part.role === 'check-result') {
      return checkResultHtml(part.text)
        .split('\n')
        .map((line) => `${indent}${line}`);
    }
    return paragraphs(part.text, className).map((line) => `${indent}${line}`);
  });
}

/**
 * Setzt eine Kastenueberschrift und verweist dabei auf das Kompendium, wenn
 * ein Actor-Index vorliegt und die Ueberschrift eine Kreatur nennt.
 *
 * Verwiesen wird nur auf den **Namen**; Art und Stufe bleiben Text, damit die
 * Leiste lesbar bleibt (`@UUID[...]{Twigjack} Creature 3`).
 */
function headingHtml(text: string, level: 1 | 3, actors?: ActorSuche): string {
  const title = titleCase(text.replace(/\s+/g, ' ').trim());
  const link = actors?.find(title);
  const inner = link
    ? `${escapeHtml(link.before)}${actorUuid(link)}${escapeHtml(link.after)}`
    : escapeHtml(title);
  return `<h${level} class="no-toc">${inner}</h${level}>`;
}

/**
 * Die Leiste einer Kreatur — Name links, Art und Stufe rechts.
 *
 * `.statblock` ist eine eingebaute Klasse des PF2e-Systems: sie setzt die
 * Ueberschrift in Versalien und zieht das fuehrende `<strong>` des Textes
 * haengend nach links. Fuer den Ausschlag nach beiden Seiten braucht die
 * Ueberschrift **zwei** Kinder — `space-between` hat sonst nichts zu verteilen.
 *
 * Der Ausschlag selbst steht zusaetzlich inline, damit die Leiste auch ohne
 * fremdes CSS sitzt. Beides beisst sich nicht: das System steuert Schrift und
 * Versalien bei, der Inline-Stil nur die Anordnung.
 */
const STATBLOCK_HEADING_STYLE = [
  'display:flex',
  'justify-content:space-between',
  'align-items:baseline',
  'border-bottom:1px solid currentColor',
].join(';');

function statblockHtml(heading: string, body: string[], actors?: ActorSuche): string {
  const title = titleCase(heading.replace(/\s+/g, ' ').trim());
  const link = actors?.find(title);
  const parsed = parseCreatureHeading(title);

  const [name, rank] = link
    ? [`${escapeHtml(link.before)}${actorUuid(link)}`, escapeHtml(link.after)]
    : parsed
      ? [escapeHtml(parsed.name), escapeHtml(parsed.suffix)]
      : [escapeHtml(title), ''];

  return [
    '<div class="statblock">',
    // Das Leerzeichen vor der Stufe bleibt stehen: `space-between` schiebt die
    // beiden ohnehin auseinander, und ohne CSS liest sich die Leiste weiter.
    `  <h3 class="no-toc" style="${STATBLOCK_HEADING_STYLE}"><span>${name}</span><span>${rank}</span></h3>`,
    // Merkmalslisten und Erfolgsstufen kommen als **ein** mehrzeiliger Teil an;
    // ohne das Aufteilen bekaeme nur ihre erste Zeile die Einrueckung.
    ...body.flatMap((part) => part.split('\n').map((line) => `  ${line}`)),
    '</div>',
  ].join('\n');
}

/**
 * Der Verweis unter einer Kreaturen- oder Gefahrenleiste: wo der Statblock
 * steht, und bei Kreaturen, womit sie Initiative wuerfelt.
 *
 * Die Rolle taugt hier nicht als Merkmal — je nach Laenge kommt der Verweis als
 * `body`, `box` oder `statblock` an. Fest ist der **Anfang**: er nennt immer
 * die Seite. Was danach folgt, ist unterschiedlich lang —
 * `Page 11 **Initiative** Perception +3`, `Page 22, art on page 47` oder bei
 * einer Gefahr nur `Page 31`. Auf `**Initiative**` allein zu pruefen liess in
 * den dreizehn Heften 163 Verweise neben ihrer Leiste stehen statt darin.
 */
const CREATURE_REFERENCE = /^Page \d|\*\*Initiative\*\*/;

/**
 * Der Vorlesekasten, als **Inline-Stil**.
 *
 * Das Journal soll fuer sich stehen: eigenes CSS braeuchte ein Modul, und ein
 * `<style>`-Block im Journaltext kommt in keinem der rund 90 geprueften
 * offiziellen Journale vor — der Editor wirft ihn beim Speichern weg. Inline
 * gesetzte Stile sind dagegen der uebliche Weg; allein in diesen Journalen
 * stehen tausende davon (`transform:scale(1)`, `background-color:var(--ancestry)`).
 *
 * Gearbeitet wird mit `currentColor` statt mit festen Farben, damit der Kasten
 * in hellem wie dunklem Aufzug sitzt. Die Toenung liegt als neutrales Grau
 * darunter: `color-mix` ist jung, und faellt es aus, bleibt der Kasten trotzdem
 * abgesetzt. Wer es anders haben will, aendert diese eine Zeile.
 */
const READ_ALOUD_STYLE = [
  'border-left:3px solid currentColor',
  'background-color:rgba(127,127,127,0.1)',
  'background-color:color-mix(in srgb, currentColor 8%, transparent)',
  'padding:0.5em 0.9em',
  'margin:1em 0',
].join(';');

/**
 * Ein Kasten wird zum Sidebar-Element, wenn sein Titel mittig steht, sonst
 * bleibt er als Eintrag im Fliesstext. Ohne Titel ist er Vorlesetext.
 * Genau so unterscheidet das Vorbild-Journal die drei.
 */
function boxHtml(document: BoxDocument, actors?: ActorSuche): string {
  const rest = document.parts.slice(document.title === undefined ? 0 : 1);

  if (document.title === undefined) {
    return [
      `<blockquote class="read-aloud" style="${READ_ALOUD_STYLE}">`,
      ...boxParts(rest, '  '),
      '</blockquote>',
    ].join('\n');
  }

  // Eine Kreaturenleiste steht auch dann als Statblock da, wenn ihr Verweis
  // lang genug war, um als Kasten durchzugehen.
  if (!document.sidebar && parseCreatureHeading(titleCase(document.title.trim()))) {
    return statblockHtml(document.title, boxParts(rest, ''), actors);
  }

  // Ein Eintrag im Fliesstext — Hindernis, Gefahr, Infiltration — traegt seine
  // Ueberschrift offen und steht ohne Rahmen an seiner Stelle im Ablauf.
  if (!document.sidebar) {
    return [headingHtml(document.title, 3, actors), ...boxParts(rest, '')].join('\n');
  }

  const body: string[] = [`  <h1 class="no-toc">${escapeHtml(titleCase(document.title))}</h1>`];
  let action: string[] | null = null;

  for (const part of rest) {
    if (part.role === 'box-heading') {
      // Ein zweiter Titel im Sidebar eroeffnet eine Aktivitaet.
      if (action) body.push(...action, '  </div>');
      action = ['  <div class="action">', `    ${headingHtml(part.text, 3, actors)}`];
      continue;
    }

    const rendered = action
      ? boxParts([part], '    ', 'no-indent')
      : boxParts([part], '  ');
    if (action) action.push(...rendered);
    else body.push(...rendered);
  }

  if (action) body.push(...action, '  </div>');

  return ['<aside class="sidebar float-right">', ...body, '</aside>'].join('\n');
}

function blockHtml(block: Block, actors?: ActorSuche): string {
  switch (block.role) {
    case 'check-result':
      return checkResultHtml(block.text);
    case 'caption':
      // Ohne das Bild bleibt nur der Hinweis; er soll nicht verloren gehen.
      return `<!-- Bildunterschrift: ${escapeHtml(block.text)} -->`;
    case 'statblock':
      return paragraphs(block.text).join('\n');
    case 'box-heading':
      return headingHtml(block.text, 3, actors);
    case 'traits':
      return traitsHtml(block.text, '');
    default:
      return paragraphs(block.text).join('\n');
  }
}

export interface JournalPage {
  name: string;
  level: 1 | 2 | 3;
  html: string;
}

/**
 * Schwierigkeitsgrad am Ende eines Begegnungstitels, mitsamt der Stufe
 * dahinter: `The Sinister Stevedores Low 1` wie `D2. Hall of Graves Moderate`.
 */
const DIFFICULTY = /\s+(Trivial|Low|Moderate|Severe|Extreme)(\s+\d+)?$/;

/**
 * Der Name einer Journalseite.
 *
 * Gekuerzt wird nur der **Schwierigkeitsgrad** — er gilt fuer die Begegnung,
 * nicht fuer den Abschnitt, und im Seitenverzeichnis steht er nur im Weg. Die
 * Ueberschrift im Inhalt bleibt vollstaendig.
 *
 * Die **Ortskennung bleibt stehen**: `A. The Sinister Stevedores`,
 * `B. The Gallivanting Ghoul`. Sie ordnet die Begegnungen und verweist auf die
 * Karte; ohne sie steht im Verzeichnis eine Reihe gleichrangiger Namen, und
 * welcher Ort welcher ist, muss man im Text nachschlagen. Das Vorbild-Journal
 * kuerzt sie zwar weg, aber am Tisch fehlt sie.
 */
export function pageName(heading: string): string {
  return heading.replace(DIFFICULTY, '').trim();
}

/** Rollen, die im Journal nichts verloren haben. */
const SKIPPED: ReadonlySet<Block['role']> = new Set(['map-label']);

/**
 * `Levels 1–2` trennt im PDF die beiden Stufenfassungen einer Begegnung.
 *
 * Im Vorbild-Journal kommt diese Zeile nicht vor: dort sind beide Fassungen zu
 * einem Text verschmolzen, und nur die abweichenden Werte stehen in
 * `<span class="low-tier">` und `<span class="high-tier">`. Die Zeile ist also
 * ein Satzartefakt und darf keine Journalseite eroeffnen.
 */
const TIER_LABEL = /^Levels?\s+\d\s*[–-]\s*\d$/;

/** Bis zu dieser Seite steht das Inhaltsverzeichnis. */
const TOC_MAX_PAGE = 4;

/** Ein Abschnitt des Hefts, wie ihn das Inhaltsverzeichnis fuehrt. */
/** Eine im Szenario gefundene Kreatur samt gewuenschter Fassung. */
export interface GefundeneKreatur {
  /** Die Vorlage im Kompendium — bei Varianten die Grundform. */
  entry: ActorEntry;
  /** Elite oder Schwach, wenn die Ueberschrift eine Anpassung nennt. */
  anpassung?: Adjustment;
  /** Endgueltiger Name von Actor und Token — der Wortlaut der Kopfzeile. */
  name: string;
  /** Basisname aus der Quellenzeile, wenn der Statblock eine Variante ist. */
  variante?: string;
  /** Stufe und Art der Kopfzeile — fuer die Welt-Verweise. */
  stufe: number;
  art: ActorKind;
  /**
   * Der abgedruckte Statblock, falls die Kopfzeile im Anhang steht.
   *
   * Er wird hier gleich mitgenommen, weil diese Schleife ohnehin an jeder
   * Kopfzeile steht — ihn hinterher ueber den Namen wiederzufinden waere
   * unnoetig und bei Mehrfachnennungen unsicher. Die Kopfzeilen der
   * Begegnungsliste haben keinen: dort folgt Fliesstext statt der
   * Merkmalsplakette.
   */
  statblock?: Statblock;
}

/** Ein Statblock, zu dem es keine Kompendium-Vorlage gibt. */
export interface OhneVorlage {
  /** Name der Kopfzeile, in Titelschreibung. */
  name: string;
  art: ActorKind;
  /**
   * Der abgedruckte Statblock, falls die Kopfzeile im Anhang steht.
   *
   * Nur damit laesst sich etwas bauen. Fehlt er, stand die Kopfzeile bloss in
   * der Begegnungsliste und nennt eine Vorlage, die der Index nicht kennt —
   * dann bleibt es beim Melden.
   */
  statblock?: Statblock;
}

export interface Kreaturenfund {
  kreaturen: GefundeneKreatur[];
  /** Statbloecke, zu denen keine Vorlage gefunden wurde. */
  ohneVorlage: OhneVorlage[];
}

/** Anzahl hinter dem Namen (`Wight (2)`) — gehoert nicht zum Actor-Namen. */
const ANZAHL = /\s*\(\d+\)\s*$/;

/**
 * Die Quellenzeile steht im ersten Textblock nach der Kopfzeile — im Appendix
 * als `statblock`, in der Begegnungsliste als `box` oder `body`
 * (`Elite twigjack, page 12 **Initiative** …`). Merkmalsplaketten dazwischen
 * werden uebersprungen; eine weitere Kopfzeile beendet die Suche.
 */
function quelleHinter(blocks: Block[], kopf: number): Block | undefined {
  for (let i = kopf + 1; i <= kopf + 3 && i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.role === 'traits') continue;
    if (block.role === 'statblock' || block.role === 'box' || block.role === 'body') return block;
    return undefined;
  }
  return undefined;
}

/**
 * Sammelt die Kreaturen und Gefahren des Szenarios ein, in zwei Stufen:
 *
 * 1. **Direkter Treffer** wie bei den Verweisen — Statblock-Zeile gegen den
 *    Kompendium-Index, ueber die Stufe geprueft (auch Elite/Schwach).
 * 2. **Variante:** Nennt die Quellenzeile unter der Kopfzeile eine Vorlage
 *    (`Variant pirate (*Pathfinder NPC Core* 147)`), wird die Vorlage ueber
 *    ihren **Namen** gefunden — ohne Stufenprobe, die Zeile selbst ist die
 *    Probe. Der Actor traegt dann den Namen des Statblocks
 *    (`Captain Ashfell Grimme`), nicht den der Vorlage.
 *
 * Jede Fassung zaehlt einmal; was uebrig bleibt, landet in `ohneVorlage` und
 * gehoert in die Vorschau — verschwiegen wuerde es fuer importiert gehalten.
 */
export function sammleKreaturen(blocks: Block[], actors: ActorIndex): Kreaturenfund {
  const gesehen = new Map<string, GefundeneKreatur>();
  const ohneVorlage: OhneVorlage[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const titel = titleCase(blocks[i]!.text.replace(/\s+/g, ' ').trim());
    const parsed = parseCreatureHeading(titel);
    if (!parsed) continue;

    const name = parsed.name.replace(ANZAHL, '').trim();
    if (name === '') continue;
    const art: ActorKind = parsed.kind === 'hazard' ? 'hazard' : 'creature';

    // Dieselbe Kreatur steht zweimal im Heft: in der Begegnungsliste und im
    // Anhang. Nur die zweite Stelle traegt den Statblock.
    const statblock = leseStatblockAn(blocks, i)?.statblock;

    const merke = (kreatur: GefundeneKreatur): void => {
      const schluessel = `${kreatur.entry.pack}|${kreatur.entry.id}|${kreatur.anpassung ?? ''}|${kreatur.name}`;
      const vorhanden = gesehen.get(schluessel);
      if (!vorhanden) {
        gesehen.set(schluessel, kreatur);
        return;
      }
      // Die Begegnungsliste kommt zuerst und hat keinen Statblock. Taucht er
      // spaeter im Anhang auf, wird er nachgetragen — sonst bliebe die
      // Kreatur ohne, obwohl das Heft ihn druckt.
      if (!vorhanden.statblock && kreatur.statblock) vorhanden.statblock = kreatur.statblock;
    };

    const link = actors.find(titel);
    if (link) {
      // Direkte Treffer heissen wie im Kompendium (samt Elite/Weak-Vorsilbe
      // aus der Kopfzeile): `Animated Brooms (3)` wird der Actor
      // `Animated Broom` — die Einzahl gehoert auf den Token.
      merke({
        entry: link.entry,
        ...(link.adjustment ? { anpassung: link.adjustment } : {}),
        name: `${link.before}${link.entry.name}`,
        stufe: parsed.level,
        art,
        ...(statblock ? { statblock } : {}),
      });
      continue;
    }

    const quelle = quelleHinter(blocks, i);
    const zeile = quelle ? parseQuelle(quelle.text.replace(/\s+/g, ' ').trim()) : undefined;
    if (zeile?.vorlage) {
      const basis = loeseVorlage(zeile.vorlage, art, actors);
      if (basis) {
        merke({
          entry: basis.entry,
          ...(basis.anpassung ? { anpassung: basis.anpassung } : {}),
          name,
          variante: zeile.vorlage,
          stufe: parsed.level,
          art,
          ...(statblock ? { statblock } : {}),
        });
        continue;
      }
    }

    // Gemeldet wird nur, was wirklich ein Statblock ist oder ausdruecklich
    // eine Vorlage nennt — eine blosse Erwaehnung im Fliesstext nicht.
    //
    // Die Probe war frueher die **Rolle** des Folgeblocks (`statblock`). Das
    // traegt bei Kreaturen, aber nicht bei Gefahren: Paizo setzt deren
    // Anhangsblock mal als `statblock`, mal als `box`, mal als
    // `check-result`. Von den fuenf Gefahren der Season 8 kam so nur eine
    // einzige in der Vorschau an, die vier anderen fielen lautlos heraus
    // (am 14.08.2026 an den Screenshots der Testinstanz aufgefallen).
    //
    // Seit es den Statblock-Leser gibt, ist die Probe exakt: Steht hinter der
    // Kopfzeile eine Merkmalsplakette, ist es ein Statblock.
    if (
      (statblock !== undefined || zeile !== undefined) &&
      !ohneVorlage.some((eintrag) => eintrag.name === name)
    ) {
      ohneVorlage.push({ name, art, ...(statblock ? { statblock } : {}) });
    }
  }

  // Was in der Begegnungsliste nur mit `Page N` steht, bekommt seine Werte
  // im Appendix — dort wird es aufgeloest und faellt hier wieder heraus.
  const angelegt = new Set([...gesehen.values()].map((kreatur) => kreatur.name));
  return {
    kreaturen: [...gesehen.values()],
    ohneVorlage: ohneVorlage.filter((eintrag) => !angelegt.has(eintrag.name)),
  };
}

export interface Section {
  /** Wortlaut des Verzeichniseintrags — `Adventure`, `Appendix: Statistics`. */
  title: string;
  from: number;
  /** Letzte Seite; beim letzten Abschnitt unbekannt und darum unendlich. */
  to: number;
}

/**
 * Die Abschnitte des Hefts, aus dem Inhaltsverzeichnis des PDFs gelesen.
 *
 * Das Verzeichnis nennt die Seiten selbst (`Adventure ... 3`,
 * `Appendix: Statistics ... 11`), was zuverlaessiger ist als jede Faustregel
 * ueber Seitenzahlen. Wo ein Abschnitt endet, sagt es nicht — das ist die Seite
 * vor dem naechsten Eintrag.
 */
export function detectSections(blocks: Block[]): Section[] {
  const entries: { title: string; page: number }[] = [];

  for (const block of blocks) {
    if (block.page > TOC_MAX_PAGE) continue;
    // `Adventure . . . . . 3` — Text, Punktfuehrung, Seitenzahl.
    const entry = /^(.+?)[.\s]{4,}(\d+)$/.exec(block.text.trim());
    if (entry) entries.push({ title: entry[1]!.trim(), page: Number(entry[2]) });
  }

  if (entries.length < 2) return [];

  // Das Verzeichnis nennt die Abschnitte in Leserichtung. Zwei Eintraege auf
  // derselben Seite waeren kein Abschnitt von der Laenge null, sondern ein
  // Lesefehler — dann gilt der erste.
  const sorted = [...entries].sort((a, b) => a.page - b.page);
  const unique = sorted.filter((entry, at) => at === 0 || entry.page !== sorted[at - 1]!.page);

  return unique.map((entry, at) => ({
    title: entry.title,
    from: entry.page,
    to: at + 1 < unique.length ? unique[at + 1]!.page - 1 : Number.POSITIVE_INFINITY,
  }));
}

/**
 * Grenzen des Abenteuerteils.
 *
 * Der erste Abschnitt ist das Abenteuer. Auf den Namen zu achten traegt nicht —
 * Season 1 fuehrt dort den Szenarientitel, Season 7 das Wort `Adventure`.
 */
export function detectAdventureRange(
  blocks: Block[],
): { from: number; to: number } | undefined {
  const [adventure] = detectSections(blocks);
  if (!adventure || !Number.isFinite(adventure.to)) return undefined;
  return { from: adventure.from, to: adventure.to };
}

/**
 * Zerlegt das Szenario in Journalseiten. Jede Ueberschrift eroeffnet eine neue
 * Seite; was davor steht, gehoert noch zur vorigen.
 */
export function buildPages(scenario: Scenario, actors?: ActorSuche): JournalPage[] {
  const documents = groupBoxes(scenario.blocks);
  const boxAt = new Map<number, BoxDocument>();
  const consumed = new Set<number>();
  for (const document of documents) {
    boxAt.set(document.index, document);
    for (const index of document.indices) consumed.add(index);
  }

  const sections = detectSections(scenario.blocks);
  const range = sections[0] && Number.isFinite(sections[0].to)
    ? { from: sections[0].from, to: sections[0].to }
    : undefined;
  const pages: JournalPage[] = [];
  /** Bereits vergebene Seitennamen — Wiederholungen bleiben im Inhalt. */
  const used = new Set<string>();
  let parts: string[] = [];
  /**
   * Sidebar-Kaesten mit Titel werden zurueckgehalten und ans Seitenende
   * gesetzt. Im Satz stehen sie neben dem Text und zerschneiden ihn mitten im
   * Satz; am Ende des Kapitels stoeren sie den Lesefluss nicht.
   */
  let sidebars: string[] = [];

  const closePage = (): void => {
    const page = pages[pages.length - 1];
    if (page) page.html = [...parts, ...sidebars].join('\n');
    sidebars = [];
  };

  /** Werteblock einer Kreatur, den die Leiste darueber schon mitgenommen hat. */
  const takenByStatblock = new Set<number>();

  for (const [index, block] of scenario.blocks.entries()) {
    if (range && (block.page < range.from || block.page > range.to)) continue;
    if (takenByStatblock.has(index)) continue;

    const box = boxAt.get(index);
    if (box) {
      if (box.sidebar) sidebars.push(boxHtml(box, actors));
      else parts.push(boxHtml(box, actors));
      continue;
    }
    if (consumed.has(index) || SKIPPED.has(block.role)) continue;

    if (TIER_LABEL.test(block.text.trim())) {
      parts.push(`<h3 class="no-toc">${escapeHtml(block.text.trim())}</h3>`);
      continue;
    }

    if (block.role === 'heading' || block.role === 'subheading') {
      const level = block.level ?? (block.role === 'heading' ? 1 : 2);
      const heading = block.text.replace(/\s+/g, ' ').trim();

      const name = pageName(heading);

      // Laeuft eine Begegnung ueber mehrere Seiten, wiederholt Paizo ihre
      // Ueberschrift. Eine zweite Journalseite waere falsch: der Text darunter
      // setzt den Satz von vorher fort. Das Vorbild-Journal wiederholt die
      // Ueberschrift stattdessen im Seiteninhalt.
      if (used.has(name)) {
        parts.push(`<h${level} class="no-toc">${escapeHtml(heading)}</h${level}>`);
        continue;
      }
      used.add(name);

      closePage();
      // Die Ueberschrift im Inhalt bleibt vollstaendig, der Seitenname nicht.
      pages.push({ name, level, html: '' });
      parts = [`<h${level} class="no-toc" data-split-here>${escapeHtml(heading)}</h${level}>`];
      continue;
    }

    // Eine Kreaturenleiste nimmt den Verweis darunter mit: erst zusammen
    // ergeben sie den Statblock, den `.statblock` gestaltet.
    if (block.role === 'box-heading' && parseCreatureHeading(titleCase(block.text.trim()))) {
      const at = index + 1;
      const next = scenario.blocks[at];
      const takes =
        next !== undefined &&
        !consumed.has(at) &&
        !boxAt.has(at) &&
        next.page === block.page &&
        CREATURE_REFERENCE.test(next.text);
      if (takes) takenByStatblock.add(at);
      if (pages.length > 0) {
        parts.push(statblockHtml(block.text, takes ? paragraphs(next.text) : [], actors));
      }
      continue;
    }

    // Was vor der ersten Ueberschrift steht, hat noch keine Seite.
    if (pages.length > 0) parts.push(blockHtml(block, actors));
  }
  closePage();

  return pages;
}

export interface JournalEntry {
  name: string;
  pages: unknown[];
}

/** Setzt das fertige Journal im Datenformat von FoundryVTT zusammen. */
/**
 * Der Name kommt von aussen herein, statt hier zu entstehen.
 *
 * In der Welt gilt das Ordner- und Namensschema von `showstopping_tools`, und
 * das kennt diese Schicht nicht — `src/pdf/` weiss nichts von Foundry. Der
 * Vergleich gegen das `journal.json` des Extractors kann so denselben Aufruf
 * mit dessen Namen (`S08-01 - Titel`) fuehren, ohne dass hier eine zweite
 * Namensregel entsteht.
 */
export function buildJournal(
  scenario: Scenario,
  name: string,
  actors?: ActorIndex,
): JournalEntry {
  const pages = buildPages(scenario, actors);

  return {
    name,
    pages: pages.map((page, index) => ({
      name: page.name,
      type: 'text',
      _id: foundryId(`${scenario.title}/${index}/${page.name}`),
      title: { show: false, level: page.level },
      text: { format: 1, content: page.html, markdown: '' },
      sort: FIRST_SORT + index * SORT_STEP,
      ownership: { default: 0 },
      flags: {},
      system: {},
      image: {},
      video: { controls: true, volume: 0.5 },
      src: null,
      category: null,
    })),
  };
}
