/**
 * Vergleich gegen ein von Hand gebautes Journal.
 *
 * Das beantwortet eine andere Frage als die Pruefung gegen den Extractor:
 * nicht "rechnet der Port dasselbe wie vorher", sondern "erkennt die Heuristik
 * dasselbe, was ein Mensch erkannt haette". Deshalb ein Aehnlichkeitsmass und
 * keine Zeichengleichheit.
 *
 * Herkunft: `src/compare.ts` des PaizoPFSScenarioTextExtractor. Das Einlesen
 * der Dateien (`readBoxes`, `compare`) blieb dort — es las die
 * Markdown-Kastendateien aus `out/`, die es hier nicht gibt. Was bleibt, ist
 * die Auswertung selbst.
 */

/**
 * Das handgemachte Journal ist dabei die einzige verfuegbare Wahrheit: ein
 * Mensch hat dort entschieden, welcher Text ein Vorlesekasten ist und wo er
 * anfaengt und aufhoert. Die Klasse `read-aloud` markiert das ausdruecklich —
 * was diese Heuristik nur errechnen kann.
 *
 * Das Journal gehoert nicht ins Repo; es wird zur Laufzeit ausgewaehlt.
 */

export interface JournalPage {
  name?: string;
  title?: { level?: number };
  text?: { content?: string };
}

export interface Comparison {
  journalBoxes: number;
  extractedBoxes: number;
  matches: Array<{ score: number; file: string | null; excerpt: string }>;
  pages: PageComparison;
}

export interface PageComparison {
  /** Seiten, die es in beiden gibt — nach Name und Gliederungstiefe. */
  gemeinsam: string[];
  /** Im Journal vorhanden, von der Extraktion nicht erzeugt. */
  fehlend: string[];
  /** Zusaetzlich erzeugt; meist Satzartefakte ohne eigene Journalseite. */
  ueberzaehlig: string[];
}

function pageKey(name: string, level: number): string {
  return `${level}|${normalise(name)}`;
}

/**
 * Vergleicht die Seitengliederung. Die Namen sind die Ueberschriften des PDFs,
 * die Tiefe entspricht `title.level` — beides muss stimmen, damit sich die
 * Journale ueberhaupt sinnvoll gegeneinander halten lassen.
 */
export function comparePages(
  journalPages: JournalPage[],
  ownPages: JournalPage[],
): PageComparison {
  const own = new Map<string, string>();
  for (const page of ownPages) {
    own.set(pageKey(page.name ?? '', page.title?.level ?? 0), page.name ?? '');
  }

  const gemeinsam: string[] = [];
  const fehlend: string[] = [];
  const seen = new Set<string>();

  for (const page of journalPages) {
    const key = pageKey(page.name ?? '', page.title?.level ?? 0);
    if (own.has(key)) {
      gemeinsam.push(page.name ?? '');
      seen.add(key);
    } else {
      fehlend.push(`${page.name} (Ebene ${page.title?.level})`);
    }
  }

  const ueberzaehlig: string[] = [];
  for (const [key, name] of own) {
    if (!seen.has(key)) ueberzaehlig.push(name);
  }

  return { gemeinsam, fehlend, ueberzaehlig };
}

/** Ab dieser Aehnlichkeit gilt ein Kasten als getroffen. */
export const MATCH_THRESHOLD = 0.9;

/**
 * Macht Journal-HTML und Markdown vergleichbar: Foundry-Verweise werden auf
 * ihren Anzeigetext reduziert, Wuerfelproben ganz entfernt — `@Check[medicine|
 * dc:18]` steht im PDF als „DC 18 Medicine check" und ist kein Textunterschied,
 * den es zu melden lohnt.
 */
export function normalise(text: string): string {
  return text
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@\w+\[[^\]]*\](\{[^}]*\})?/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    // Aus `<strong>fein</strong>.` wird sonst `fein .` — nur auf der
    // HTML-Seite, was den Vergleich unnoetig verschlechtert.
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .toLowerCase();
}

/** Aehnlichkeit ueber gemeinsame Zeichenpaare; 1 heisst wortgleich. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2);
    const left = pairs.get(pair) ?? 0;
    if (left > 0) {
      pairs.set(pair, left - 1);
      shared++;
    }
  }

  return (2 * shared) / (a.length - 1 + b.length - 1);
}

/**
 * Die ausdruecklich als Vorlesetext markierten Abschnitte des Journals.
 *
 * Das Element wechselt je nach Herkunft: die offiziellen PFS-Journale setzen
 * `<div class="read-aloud">`, dieses Werkzeug `<blockquote class="read-aloud">`.
 * Verglichen wird gegen beides, damit ein Journal aus jeder Quelle taugt.
 */
export function readAloudsFrom(journal: { pages?: JournalPage[] }): string[] {
  const html = (journal.pages ?? []).map((page) => page.text?.content ?? '').join('\n');
  const found =
    html.match(/<(div|blockquote)[^>]*\bread-aloud\b[^>]*>([\s\S]*?)<\/\1>/g) ?? [];
  return found.map(normalise).filter((text) => text.length > 60);
}

export function renderComparison(result: Comparison): string {
  const lines = [
    `Vorlesekaesten im Journal: ${result.journalBoxes}`,
    `Kastendateien erzeugt:     ${result.extractedBoxes}`,
    '',
  ];

  let hits = 0;
  for (const match of [...result.matches].sort((a, b) => a.score - b.score)) {
    const ok = match.score >= MATCH_THRESHOLD;
    if (ok) hits++;
    lines.push(
      `  ${ok ? 'OK  ' : 'FEHL'} ${match.score.toFixed(2)}  ${(match.file ?? '-').padEnd(14)} | ${match.excerpt}`,
    );
  }

  lines.push('', `Getroffen: ${hits}/${result.matches.length}`);
  if (hits < result.matches.length) {
    lines.push('Abweichungen zeigen, wo Kaesten zerfallen oder Fremdtext einsammeln.');
  }

  const { gemeinsam, fehlend, ueberzaehlig } = result.pages;
  lines.push(
    '',
    'Seitengliederung',
    `  deckungsgleich: ${gemeinsam.length}/${gemeinsam.length + fehlend.length}`,
  );
  for (const name of fehlend) lines.push(`  fehlt:       ${name}`);
  for (const name of ueberzaehlig) lines.push(`  ueberzaehlig: ${name}`);

  return `${lines.join('\n')}\n`;
}
