import type { BlockRole, TextRun } from './types.ts';

/**
 * `drop` fliegt ganz raus, `inline` bleibt im Text, zaehlt aber nicht bei der
 * Frage mit, welche Textsorte eine Zeile bestimmt — ein Aktionssymbol mitten
 * im Statblock macht die Zeile nicht zu Fliesstext.
 */
export type RunRole = BlockRole | 'drop' | 'inline';

/**
 * Eingebettete Teilschriften tragen ein Praefix aus sechs Grossbuchstaben,
 * etwa `YALYRB+TimesNewRomanPS-BoldMT`. Es wechselt von Datei zu Datei und
 * muss weg, bevor der Name mit einer Regel verglichen wird.
 */
export function normaliseFontName(font: string): string {
  return font.replace(/^[A-Z]{6}\+/, '');
}

interface FontRule {
  /** Wofuer die Schrift steht — zur Anzeige im Profil. */
  zweck: string;
  passt: (font: string, size: number) => boolean;
  rolle: RunRole;
}

/**
 * Der Kolumnentitel wird nicht ueber den Schriftgrad erkannt, sondern ueber
 * seine Wiederholung im Seitenrand — siehe `headers.ts`. Season 1 setzt ihn in
 * derselben Schrift wie Zwischenueberschriften, Season 7 dagegen gross; ein
 * Grenzwert traefe immer nur einen der beiden Faelle.
 */

/**
 * Die Hausschriften, in denen Paizo Ueberschriften und Kolumnentitel setzt.
 *
 * Sie wechseln mit dem Jahrgang: Season 6 nutzt Columbus, Season 7 Ironstrike,
 * Season 8 Berylium.
 * Die Rollen bleiben dieselben — gross gesetzt der Kolumnentitel, darunter die
 * Abschnittsueberschrift, in der schwarzen Schnittvariante die
 * Bildunterschrift. Deshalb steht hier eine Familie und keine Einzelregel je
 * Schrift; ein neuer Jahrgang braucht nur einen weiteren Namen.
 */
const DISPLAY_FONTS = [
  'Taroca',          // Season 1
  'FMBolyar',        // Season 2
  'Masoch-Dirach',   // Season 3
  'Alcoholica',      // Season 4
  'CartaMarina',     // Season 5
  'Columbus',        // Season 6
  'Ironstrike',      // Season 7
  'Berylium',        // Season 8
];

/**
 * Bis zu diesem Grad setzt eine Hausschrift Bildunterschriften, darueber
 * Ueberschriften. Season 1 nutzt dafuer dieselbe Schrift in zwei Graden
 * (`Taroca` 12 pt unter Bildern, 16 pt und mehr fuer Abschnitte); Season 7
 * unterscheidet sie zusaetzlich ueber den Schnitt (`Ironstrike-Black`).
 */
const CAPTION_MAX_SIZE = 13;

/**
 * Kapitaelchen-Schnitte tragen durchgehend das Suffix `-SC700`, quer durch alle
 * Hausschriften (`Ironstrike-ExtraBold-SC700`, `BeryliumBold-SC700`,
 * `CartaMarinaBold-SC700`, `FMBolyar-SC700`). Sie setzen immer Ueberschriften.
 */
const SMALL_CAPS = /-SC700$/;

export function isDisplayFont(font: string): boolean {
  const name = normaliseFontName(font);
  return DISPLAY_FONTS.some((family) => name.startsWith(family));
}

/** Ab hier ist eine Kastenschrift eine Zwischenueberschrift. */
const SUBHEADING_MIN_SIZE = 11;

/** Dasselbe fuer die fette Schnittvariante, die schon auf 10 pt Titel setzt. */
const SUBHEADING_BOLD_MIN_SIZE = 9.6;

/** Ab diesem Grad ist eine Zwischenueberschrift die hoehere der beiden Stufen. */
const SUBHEADING_LEVEL2_MIN_SIZE = 11.5;

/**
 * Die Gliederungstiefe einer Ueberschrift — im FoundryVTT-Journal wird daraus
 * `title.level` und das `<hN>` der Seite.
 *
 * Gemessen am Beispielszenario: `Ironstrike-ExtraBold` (15/18 pt) traegt die
 * Abschnitte, `GoodOT-Bold` auf 12 pt die Unterabschnitte und auf 10 pt die
 * einzelnen Proben.
 */
export function headingLevel(font: string, size: number): 1 | 2 | 3 | undefined {
  const name = normaliseFontName(font);
  if (classifyFont(name, size).rolle === 'heading') return 1;
  if (name.startsWith('GoodOT')) {
    if (size >= SUBHEADING_LEVEL2_MIN_SIZE) return 2;
    if (size >= SUBHEADING_BOLD_MIN_SIZE) return 3;
  }
  return undefined;
}

/**
 * Bis zu diesem Grad ist schmale Fettschrift eine Merkmalsplakette
 * (`CONCENTRATE`), darueber eine Titelzeile (`GUIDING CIVILIANS`).
 * Gemessen: Plaketten stehen auf 7 pt, Titel auf 12 pt und mehr.
 */
const TRAIT_MAX_SIZE = 8;

/**
 * Paizo setzt jede Textsorte in einer eigenen Schrift. Das ist das mit Abstand
 * verlaesslichste Merkmal, das die PDFs hergeben — verlaesslicher als Position
 * oder Einrueckung, die der zweispaltige Satz staendig verschiebt.
 *
 * Die Reihenfolge zaehlt: die erste passende Regel gewinnt.
 */
export const FONT_RULES: readonly FontRule[] = [
  {
    zweck: 'Wasserzeichen',
    passt: (font) => font.startsWith('Times-Italic') || font.startsWith('OlsenTF'),
    rolle: 'drop',
  },
  {
    zweck: 'Seitenzahl',
    passt: (font) => font.startsWith('AvenirNextCondensed'),
    rolle: 'drop',
  },
  {
    zweck: 'Bildunterschrift',
    passt: (font, size) =>
      isDisplayFont(font) &&
      !SMALL_CAPS.test(font) &&
      (font.includes('Black') || size <= CAPTION_MAX_SIZE),
    rolle: 'caption',
  },
  {
    zweck: 'Abschnittsueberschrift',
    passt: (font) => isDisplayFont(font) || SMALL_CAPS.test(font),
    rolle: 'heading',
  },
  {
    // Dieselbe Schrift, zwei Bedeutungen: die Merkmalsplaketten eines
    // Statblocks sind klein gesetzt, Titelzeilen deutlich groesser.
    zweck: 'Merkmalsplakette',
    passt: (font, size) => font.startsWith('GoodOT-CondBold') && size <= TRAIT_MAX_SIZE,
    rolle: 'traits',
  },
  {
    zweck: 'Kasten-, Tabellen- und Aktivitaetstitel',
    passt: (font) => font.startsWith('GoodOT-CondBold'),
    rolle: 'box-heading',
  },
  {
    // Fett und knapp ueber 9 pt ist bereits eine Ueberschrift; auf 9 pt
    // gesetzt sind dagegen die Erfolgsstufen mitten im Satz. Kursiv gesetzt
    // ist nie eine Ueberschrift, sondern ein Eigenname im Text.
    zweck: 'Zwischenueberschrift',
    passt: (font, size) =>
      font.startsWith('GoodOT-Bold') &&
      !font.includes('Italic') &&
      size >= SUBHEADING_BOLD_MIN_SIZE,
    rolle: 'subheading',
  },
  {
    zweck: 'Zwischenueberschrift',
    passt: (font, size) =>
      font.startsWith('GoodOT') && !font.includes('Italic') && size >= SUBHEADING_MIN_SIZE,
    rolle: 'subheading',
  },
  {
    zweck: 'Kastentext, Probenergebnis, Statblock',
    passt: (font) => font.startsWith('GoodOT'),
    rolle: 'box',
  },
  {
    zweck: 'Fliesstext',
    passt: (font) => font.startsWith('SabonLTStd') || font.startsWith('TimesNewRomanPS'),
    rolle: 'body',
  },
  {
    // Ein einzelnes verirrtes Leerzeichen (8-03, Seite 3) — sonst kommt die
    // Schrift in keinem Heft vor. Text erreicht das Journal ohnehin nie
    // (leere Laeufe werden gefiltert); die Regel nimmt nur der Warnung ueber
    // unbekannte Schriften diesen Satzabfall. `Times-Italic` (Wasserzeichen)
    // faengt die Regel weiter oben.
    zweck: 'Satzabfall',
    passt: (font) => font === 'Times-Roman',
    rolle: 'drop',
  },
  {
    // Die Kaestchen der Meldebogen-Seiten (U+25A1), als Zeichen ohne Aussage.
    // Fuer dieses eine Zeichen greift das Satzprogramm auf irgendeine
    // Systemschrift zurueck — bisher drei verschiedene, je nach Szenario.
    zweck: 'Formularkaestchen',
    passt: (font) =>
      font.startsWith('HiraKaku') || font.startsWith('NexusSerifOT') || font === 'Osaka',
    rolle: 'drop',
  },
  {
    zweck: 'Aktionssymbole',
    passt: (font) => font.startsWith('Pathfinder-Icons') || font.startsWith('Symbol'),
    rolle: 'inline',
  },
  {
    // Handschriftliche Handouts — Briefe und Notizen im Anhang. Sie gehoeren
    // zum Text, stehen aber in einer Schrift, die sonst nirgends vorkommt.
    zweck: 'Handschrift (Handout)',
    passt: (font) => font.startsWith('Basha') || font.startsWith('BradleyHand'),
    rolle: 'body',
  },
  {
    zweck: 'Kartenbeschriftung',
    passt: (font) => font.startsWith('TradeGothicLTStd') || font.startsWith('RomicStd'),
    rolle: 'map-label',
  },
  {
    zweck: 'Vorspann-Infokasten',
    passt: (font) => font.startsWith('AvenirNext-'),
    rolle: 'subheading',
  },
];

export interface FontClassification {
  rolle: RunRole;
  /** Falsch heisst: keine Regel passte, es gilt die Annahme Fliesstext. */
  erkannt: boolean;
  zweck: string;
}

/**
 * Ordnet eine Schrift ihrer Textsorte zu.
 *
 * Unbekannte Schriften werden als Fliesstext behandelt — die Annahme, die am
 * wenigsten Schaden anrichtet — aber als nicht erkannt gemeldet, damit sie im
 * Profil auffallen und nachgetragen werden koennen.
 */
export function classifyFont(font: string, size: number): FontClassification {
  const name = normaliseFontName(font);

  for (const rule of FONT_RULES) {
    if (rule.passt(name, size)) {
      return { rolle: rule.rolle, erkannt: true, zweck: rule.zweck };
    }
  }

  return { rolle: 'body', erkannt: false, zweck: 'unbekannt' };
}

export function runRole(run: TextRun): RunRole {
  return classifyFont(run.font, run.size).rolle;
}

/** Rollen, die einen eigenen Block erzwingen statt sich anzulagern. */
const STANDALONE: ReadonlySet<BlockRole> = new Set([
  'heading',
  'subheading',
  'box-heading',
  'caption',
]);

export function isStandalone(role: BlockRole): boolean {
  return STANDALONE.has(role);
}

/**
 * Probenergebnisse stehen in derselben Schrift wie Kastentext, sind aber kein
 * Vorlesetext. Sie fuehren die Erfolgsstufen fett, was sie sicher von einem
 * Vorlesekasten trennt, der das Wort hoechstens im Fliesstext enthaelt.
 */
export const DEGREE_LABEL = /\*\*(Critical Success|Critical Failure|Success|Failure)\*\*/;

export function looksLikeCheckResult(text: string): boolean {
  return DEGREE_LABEL.test(text);
}

/**
 * Statblocks stehen ebenfalls in der Kastenschrift, sind aber kein Vorlesetext.
 * `Perception` fuehrt jeden Kreaturenblock an; `AC` samt `HP` fangen die
 * Gefahren- und Fallenbloecke ab, die ohne Wahrnehmungswert auskommen.
 */
export function looksLikeStatblock(text: string): boolean {
  if (/\*\*Perception\*\*/.test(text)) return true;
  return /\*\*AC\*\*/.test(text) && /\*\*HP\*\*/.test(text);
}

/** Zeichnet Kursives und Fettes im Fliesstext als Markdown aus. */
export function inlineMarker(font: string): string {
  const name = normaliseFontName(font);
  if (name.includes('Italic')) return '*';
  if (name.includes('Bold')) return '**';
  return '';
}
