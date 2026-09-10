import {
  headingLevel,
  inlineMarker,
  isStandalone,
  looksLikeCheckResult,
  looksLikeStatblock,
  runRole,
} from './roles.ts';
import type { Block, BlockRole, Line, TextRun } from './types.ts';

/** Zwei Laeufe liegen auf einer Zeile, wenn ihre Grundlinien so nah sind. */
const BASELINE_TOLERANCE = 2.5;

/** Ab dieser Breite gilt eine kaum belegte Bahn als Spaltenzwischenraum. */
const MIN_GUTTER = 8;

/** Ab diesem Anteil der Seitenbreite gilt ein Lauf als seitenbreites Banner. */
const BANNER_WIDTH_RATIO = 0.5;

/** Abstand der Laufmitte zur Seitenmitte, bis zu dem ein Lauf als zentriert gilt. */
const CENTERED_TOLERANCE = 3;

/** Belegung, unterhalb derer eine Bahn als Zwischenraum zaehlt (Anteil der Spitze). */
const GUTTER_COVERAGE = 0.06;

/** Luecke zwischen zwei Laeufen, ab der ein Leerzeichen fehlt (relativ zum Grad). */
const SPACE_GAP_RATIO = 0.18;

/** Zeilenabstand, ab dem ein neuer Block beginnt (relativ zum ueblichen). */
const BLOCK_BREAK_RATIO = 1.45;

/**
 * Anteil der Messbreite, unter dem eine Zeile als Absatzende gilt.
 *
 * Vorlesekaesten sind zentriert gesetzt, ein Erstzeileneinzug ist dort nicht
 * moeglich. Gemessen: Schlusszeilen fuellen 58 bis 64 % der Messbreite,
 * laufende Zeilen 83 bis 100 %.
 */
const SHORT_LINE_RATIO = 0.75;

/**
 * Anteil der Zeilen, die buendig oder um genau einen Einzug versetzt stehen
 * muessen, damit der Erstzeileneinzug als Merkmal taugt.
 *
 * Frueher stand hier die Streuung der linken Kante (max minus min). Die kippt
 * schon an wenigen Umflusszeilen: auf Seite 8 von `S08-04` laufen die ersten
 * drei Zeilen eines Absatzes um eine Grafik (x = 393, 381, 381), die restlichen
 * elf stehen buendig bei 314. Die Streuung von 79 pt schaltete den Einzug ab,
 * und `Bruised, Beaten, but Alive:` verlor seinen Absatzanfang. Der Anteil
 * vertraegt solche Ausreisser und weist zentrierten Satz trotzdem ab.
 */
const FLUSH_SHARE = 0.6;

/**
 * Erstzeileneinzug in Punkten. Paizo ruecket um ein Geviert ein; groessere
 * Spruenge stammen vom Umfluss um Grafiken und sind kein Absatzanfang.
 */
const PARAGRAPH_INDENT: [number, number] = [5, 15];

/**
 * Findet die Spalten einer Seite ueber gering belegte senkrechte Bahnen.
 *
 * Feste Spaltengrenzen waeren einfacher, scheitern aber an Statblocks,
 * Handouts und der Titelseite, die vom zweispaltigen Grundraster abweichen.
 *
 * Der Bundsteg ist nicht voellig leer: die zentrierten Titel seitenbreiter
 * Kaesten ragen hinein. Eine Bahn zaehlt deshalb schon als Zwischenraum, wenn
 * sie deutlich schwaecher belegt ist als der Satzspiegel.
 */
export function detectColumns(runs: TextRun[], pageWidth: number): Array<[number, number]> {
  if (runs.length === 0) return [[0, pageWidth]];

  const width = Math.ceil(pageWidth);
  const coverage = new Array<number>(width).fill(0);
  for (const run of runs) {
    // Seitenbreite Banner — Titelzeilen, Autorenangaben — koennen in einem
    // zweispaltigen Satz keine Spalte sein und duerfen den Bundsteg nicht
    // zuschuetten. Eine volle Spaltenzeile misst rund 44 % der Seite, deshalb
    // liegt die Grenze darueber.
    if (run.width > width * BANNER_WIDTH_RATIO) continue;
    // Auf der Seitenmitte zentrierte Laeufe gehoeren ebenso keiner Spalte:
    // Titel, Autorenzeile, die Unterschrift eines mittig gesetzten Portraets.
    // In 8-06 ist der Titel `Falling Sparks` kuerzer als die halbe Seite; mit
    // Autorenzeile und Bildunterschrift lag er zu dritt im Bundsteg, und drei
    // war genau die Schwelle — Seite 3 wurde einspaltig gelesen, die Sidebar
    // `WHERE ON GOLARION?` zeilenweise in den Fliesstext verschraenkt.
    if (Math.abs(run.x + run.width / 2 - pageWidth / 2) <= CENTERED_TOLERANCE) continue;
    const from = Math.max(0, Math.floor(run.x));
    const to = Math.min(width - 1, Math.ceil(run.x + Math.max(run.width, 1)));
    for (let i = from; i <= to; i++) coverage[i]!++;
  }

  const threshold = Math.max(2, Math.max(...coverage) * GUTTER_COVERAGE);
  const columns: Array<[number, number]> = [];
  let start: number | null = null;
  let gutter = 0;

  for (let i = 0; i < width; i++) {
    if (coverage[i]! < threshold) {
      gutter++;
      continue;
    }
    if (gutter >= MIN_GUTTER && start !== null) {
      columns.push([start, i - gutter]);
      start = null;
    }
    gutter = 0;
    start ??= i;
  }
  if (start !== null) columns.push([start, width - 1]);

  return columns.length > 0 ? columns : [[0, pageWidth]];
}

/**
 * Ein Lauf gehoert in die erste Spalte, die er beruehrt. Seitenbreite Titel
 * liegen damit dort, wo ein Leser sie zuerst trifft.
 */
function columnOf(run: TextRun, columns: Array<[number, number]>): number {
  const left = run.x;
  const right = run.x + Math.max(run.width, 1);

  for (let i = 0; i < columns.length; i++) {
    const [from, to] = columns[i]!;
    if (right > from && left < to) return i;
  }

  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const [from, to] = columns[i]!;
    const distance = right <= from ? from - right : left - to;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Abstand, unter dem zwei gleiche Laeufe als derselbe gelten. */
const DUPLICATE_TOLERANCE = 2;

/**
 * Entfernt doppelt gesetzte Laeufe. Karten- und Bannerbeschriftungen werden
 * mehrfach uebereinander gezeichnet, um einen Rand zu erzeugen — sonst steht
 * im Text `ISGERISGER`.
 */
export function dedupeRuns(runs: TextRun[]): TextRun[] {
  const kept: TextRun[] = [];

  for (const run of runs) {
    const duplicate = kept.some(
      (other) =>
        other.text === run.text &&
        other.font === run.font &&
        Math.abs(other.x - run.x) <= DUPLICATE_TOLERANCE &&
        Math.abs(other.y - run.y) <= DUPLICATE_TOLERANCE,
    );
    if (!duplicate) kept.push(run);
  }

  return kept;
}

/** Gruppiert Laeufe zu Zeilen und bringt sie in Lesereihenfolge. */
export function buildLines(runs: TextRun[], columns: Array<[number, number]>): Line[] {
  const byColumn = new Map<string, { column: number; runs: TextRun[] }>();
  for (const run of runs) {
    const column = columnOf(run, columns);
    // Bildunterschriften stehen zentriert und treffen dabei die Grundlinie
    // fremden Textes. Sie bekommen eine eigene Bahn, damit sie sich nicht
    // mitten in einen Vorlesekasten schieben.
    const key = `${column}:${runRole(run) === 'caption' ? 'caption' : 'text'}`;
    const bucket = byColumn.get(key);
    if (bucket) bucket.runs.push(run);
    else byColumn.set(key, { column, runs: [run] });
  }

  const lines: Line[] = [];
  for (const { column, runs: columnRuns } of [...byColumn.values()].sort(
    (a, b) => a.column - b.column,
  )) {
    const sorted = [...columnRuns].sort((a, b) => b.y - a.y || a.x - b.x);
    let current: Line | null = null;

    for (const run of sorted) {
      if (current && Math.abs(current.y - run.y) <= BASELINE_TOLERANCE) {
        current.runs.push(run);
        continue;
      }
      current = {
        page: run.page,
        column,
        y: run.y,
        x: run.x,
        runs: [run],
      };
      lines.push(current);
    }
  }

  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.x = line.runs[0]?.x ?? line.x;
  }

  return lines;
}

function dominantRole(line: Line): BlockRole {
  const weight = new Map<BlockRole, number>();
  for (const run of line.runs) {
    const role = runRole(run);
    if (role === 'drop' || role === 'inline') continue;
    weight.set(role, (weight.get(role) ?? 0) + run.text.length);
  }

  let best: BlockRole = 'body';
  let bestWeight = -1;
  for (const [role, value] of weight) {
    if (value > bestWeight) {
      bestWeight = value;
      best = role;
    }
  }
  return best;
}

/** Die Gliederungstiefe der laengsten Auszeichnung einer Zeile. */
function dominantLevel(line: Line): 1 | 2 | 3 | undefined {
  let best: 1 | 2 | 3 | undefined;
  let longest = 0;
  for (const run of line.runs) {
    const level = headingLevel(run.font, run.size);
    if (level !== undefined && run.text.length > longest) {
      longest = run.text.length;
      best = level;
    }
  }
  return best;
}

/** Der Zeilenabstand, der auf dieser Seite am haeufigsten vorkommt. */
function typicalLeading(lines: Line[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const previous = lines[i - 1]!;
    const current = lines[i]!;
    if (previous.column !== current.column) continue;
    const gap = previous.y - current.y;
    if (gap > 0 && gap < 40) gaps.push(gap);
  }
  if (gaps.length === 0) return 12;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

/**
 * Naeht Bloecke zusammen, die eine eingeschobene Ueberschrift zerschnitten hat.
 *
 * Seitenbreite Kastentitel sind zentriert und landen darum in der linken
 * Spalte — mitten in einem Vorlesekasten, zu dem sie nicht gehoeren. Passen
 * die Zeilen davor und danach nach Rolle, Spalte und Abstand zusammen, gehoeren
 * sie es auch.
 */
function stitchBlocks(blocks: Block[], leading: number): Block[] {
  const result = [...blocks];

  for (let i = 1; i < result.length - 1; i++) {
    const interruption = result[i]!;
    const before = result[i - 1]!;
    const after = result[i + 1]!;

    if (interruption.lines.length !== 1 || !isStandalone(interruption.role)) continue;
    if (before.role !== after.role || before.column !== after.column) continue;

    const gap = before.lines[before.lines.length - 1]!.y - after.lines[0]!.y;
    if (gap <= 0 || gap > leading * BLOCK_BREAK_RATIO) continue;

    before.lines.push(...after.lines);
    result.splice(i + 1, 1);
  }

  return result;
}

/** Fasst Zeilen zu Bloecken zusammen: gleiche Rolle, kein Abstandssprung. */
export function buildBlocks(lines: Line[]): Block[] {
  const leading = typicalLeading(lines);
  const blocks: Block[] = [];
  let current: Block | null = null;
  let previous: Line | null = null;

  for (const line of lines) {
    const role = dominantRole(line);
    const brokenByGap =
      previous !== null &&
      (previous.column !== line.column || previous.y - line.y > leading * BLOCK_BREAK_RATIO);

    // Ueberschriften erzwingen keinen neuen Block mehr: eine umbrochene
    // Ueberschrift ist eine Ueberschrift, keine zwei. Getrennt werden sie vom
    // Abstandssprung, der zwischen zwei echten Ueberschriften immer steht.
    if (current === null || current.role !== role || brokenByGap) {
      current = {
        role,
        page: line.page,
        column: line.column,
        lines: [line],
        level: dominantLevel(line),
        text: '',
      };
      blocks.push(current);
    } else {
      current.lines.push(line);
    }
    previous = line;
  }

  return stitchBlocks(blocks, leading);
}

interface Segment {
  marker: string;
  text: string;
}

/** Breite einer Zeile von der linken Kante bis zum Ende des letzten Laufs. */
function lineWidth(line: Line): number {
  const last = line.runs[line.runs.length - 1];
  if (!last) return 0;
  return last.x + last.width - line.x;
}

/**
 * Die linke Kante, an der die meisten Zeilen stehen. Der kleinste Wert waere
 * unbrauchbar: laeuft Text um eine Grafik, wandert die Kante zeilenweise.
 */
function commonLeftEdge(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const x = Math.round(line.x);
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }

  let edge = lines[0]?.x ?? 0;
  let best = 0;
  for (const [x, count] of counts) {
    // Bei Gleichstand gewinnt die weiter links liegende Kante.
    if (count > best || (count === best && x < edge)) {
      best = count;
      edge = x;
    }
  }
  return edge;
}

function lineSegments(line: Line, plain: boolean): Segment[] {
  const segments: Segment[] = [];
  let previous: TextRun | null = null;

  for (const run of line.runs) {
    if (runRole(run) === 'drop' || run.text === '') continue;

    let text = run.text;
    if (previous) {
      const gap = run.x - (previous.x + previous.width);
      const needsSpace =
        gap > run.size * SPACE_GAP_RATIO &&
        !/\s$/.test(segments[segments.length - 1]?.text ?? '') &&
        !/^\s/.test(text);
      if (needsSpace) text = ` ${text}`;
    }

    segments.push({ marker: plain ? '' : inlineMarker(run.font), text });
    previous = run;
  }

  return segments;
}

function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.marker === segment.marker) last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

function renderSegments(segments: Segment[]): string {
  let out = '';
  for (const segment of mergeSegments(segments)) {
    if (segment.marker === '' || segment.text.trim() === '') {
      out += segment.text;
      continue;
    }
    // Auszeichnung darf keine Randleerzeichen einschliessen.
    const [, lead = '', core = '', trail = ''] = /^(\s*)(.*?)(\s*)$/s.exec(segment.text) ?? [];
    out += `${lead}${segment.marker}${core}${segment.marker}${trail}`;
  }
  return out;
}

/**
 * Haengt die naechste Zeile an. Trennstriche am Zeilenende entfallen, wenn die
 * Folgezeile klein weitergeht — bei echten Bindestrichen (`Venture-Captain`)
 * steht dort ein Grossbuchstabe oder das Wort endet.
 */
function joinLine(segments: Segment[], next: Segment[]): void {
  const last = segments[segments.length - 1];
  const first = next[0];
  if (!last || !first) {
    segments.push(...next);
    return;
  }

  if (/\p{L}-$/u.test(last.text)) {
    // Der Strich bleibt und verbindet ohne Leerzeichen. Gemessen ueber alle
    // Szenarien der Seasons 6 bis 8: jeder Bindestrich am Zeilenende gehoert
    // zu einem Kompositum (`brown-skinned`, `non-combatant`, `off-guard`).
    // Silbentrennung kommt dort nicht vor — nur im OGL-Lizenztext aelterer
    // Jahrgaenge, wo `includ-ing` dann als `includ-ing` stehen bleibt.
  } else if (!/\s$/.test(last.text) && !/^\s/.test(first.text)) {
    last.text += ' ';
  }

  segments.push(...next);
}

/** Rollen, die Fliesstext tragen und darum Absaetze kennen. */
const PROSE: ReadonlySet<BlockRole> = new Set(['body', 'box', 'statblock', 'check-result']);

function isIndented(line: Line, left: number): boolean {
  const indent = line.x - left;
  return indent >= PARAGRAPH_INDENT[0] && indent <= PARAGRAPH_INDENT[1];
}

/**
 * Groesste Streuung, die die Einzuege eines Blocks untereinander haben duerfen.
 *
 * Ein gesetzter Erstzeileneinzug hat genau **einen** Wert. Streuen die Werte,
 * ist die linke Kante bloss verwackelt und trifft das Einzugsband zufaellig —
 * auf Seite 11 von `S04-01` liegen die Zeilenanfaenge bei 312 bis 330, was neun
 * verschiedene Einzuege von 1 bis 18 pt ergibt und jede zweite Zeile zu einem
 * Absatzanfang machte.
 */
const INDENT_JITTER = 3;

/** Anteil der Zeilen, der an der linken Kante selbst stehen muss. */
const EDGE_SHARE = 0.4;

/**
 * Steht der Block auf einer buendigen linken Kante? Nur dann trennt der
 * Erstzeileneinzug Absaetze; bei zentriertem oder verwackeltem Satz ist jeder
 * Einzug Zufall.
 *
 * Zwei Bedingungen: Die Mehrheit der Zeilen steht an der Kante selbst oder um
 * genau einen Einzug davor — Umflusszeilen duerfen dazwischenliegen, solange
 * sie in der Minderheit bleiben. Und die Einzuege muessen sich einig sein.
 */
function isFlushSet(lines: Line[], left: number): boolean {
  // Die Kante muss ueberhaupt eine wiederholte Kante sein. Auf Seite 7 von
  // `S01-01` beginnen vier Zeilen an vier verschiedenen Stellen (321, 312,
  // 320, 338) — dort ist `commonLeftEdge` nur der kleinste Zufallswert, und
  // `1 Treasure / Bundle.` riss mitten im Satz auseinander.
  const onEdge = lines.filter((line) => Math.abs(line.x - left) <= INDENT_JITTER).length;
  if (onEdge < lines.length * EDGE_SHARE) return false;

  const indents = lines
    .filter((line) => isIndented(line, left))
    .map((line) => line.x - left);
  if (indents.length > 0 && Math.max(...indents) - Math.min(...indents) > INDENT_JITTER) {
    return false;
  }

  const aligned = lines.filter(
    (line) => Math.abs(line.x - left) < PARAGRAPH_INDENT[0] || isIndented(line, left),
  ).length;
  return aligned >= lines.length * FLUSH_SHARE;
}

/**
 * Unterscheidet haengenden Einzug vom Erstzeileneinzug.
 *
 * Beide sehen gleich aus — eine buendige Zeile, darunter eingerueckte —, meinen
 * aber das Gegenteil: beim Erstzeileneinzug eroeffnet die eingerueckte Zeile
 * einen Absatz, beim haengenden setzt sie den laufenden fort. Paizo setzt die
 * Hindernis- und Statblockeintraege haengend (`Chase Points 4; Overcome ...`),
 * den Fliesstext im Kasten dagegen mit Erstzeileneinzug.
 *
 * Entscheiden laesst sich das nur an einer **Fortsetzungszeile**: eine
 * eingerueckte Zeile, die mitten im Satz endet, laeuft zwangslaeufig weiter.
 * Ist die naechste Zeile ebenfalls eingerueckt, gehoert der Einzug zum Absatz
 * (haengend); ist sie buendig, markiert der Einzug den Absatzanfang.
 */
function usesHangingIndent(lines: Line[], left: number): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (!isIndented(line, left)) continue;
    // Eine abgeschlossene Zeile sagt nichts: dort darf beides folgen.
    if (SENTENCE_END.test(renderSegments(lineSegments(line, true)))) continue;
    return isIndented(lines[i + 1]!, left);
  }
  return false;
}

/**
 * Setzt den Text eines Blocks; Absaetze erkennt der Erstzeileneinzug.
 *
 * Ueberschriften und Merkmalsleisten bleiben ohne Auszeichnung — sie sind
 * ohnehin durchgehend fett gesetzt, und `## **Titel**` waere doppelt gemoppelt.
 */
export function renderBlock(block: Block): string {
  const plain = isStandalone(block.role) || block.role === 'traits';
  const left = commonLeftEdge(block.lines);
  // Nur bei buendigem Satz taugt der Erstzeileneinzug als Merkmal. Das gilt
  // auch im Kasten: der Sidebar-Kasten ist buendig gesetzt, und nur der Einzug
  // trennt dort `Easier:` und `Harder:` in eigene Absaetze — beide Zeilen sind
  // zu lang, um als Schlusszeile aufzufallen. Haengend gesetzte Eintraege
  // ruecken dagegen die Fortsetzung ein; dort waere der Einzug das Gegenteil
  // eines Absatzanfangs.
  const byIndent =
    PROSE.has(block.role) &&
    isFlushSet(block.lines, left) &&
    !usesHangingIndent(block.lines, left);
  const measure = Math.max(...block.lines.map(lineWidth));
  const paragraphs: Segment[][] = [];
  let current: Segment[] | null = null;
  let previousWasShort = false;
  /** Der Blockanfang zaehlt als Satzgrenze. */
  let previousEndsSentence = true;

  for (const line of block.lines) {
    const segments = lineSegments(line, plain);
    if (segments.length === 0) continue;

    // Ein Absatz faengt nur dort an, wo der vorige Satz zu Ende ist. Ohne
    // diesen Vorbehalt macht schon eine Umflusszeile, die zufaellig ins
    // Einzugsband faellt, einen Absatzanfang mitten im Satz: auf Seite 12 von
    // `S06-01` riss `... rooms and smaller` / `buildings. Unless otherwise
    // stated ...` auseinander.
    const startsParagraph =
      (byIndent && isIndented(line, left) && previousEndsSentence) || previousWasShort;
    // Die kurze Schlusszeile traegt in beiden Satzarten — aber nur, wenn dort
    // auch ein Satz endet. Laeuft Text um eine Grafik, ist jede Zeile kurz,
    // ohne dass ein Absatz endet; der Satzpunkt trennt beides zuverlaessig.
    const text = renderSegments(segments);
    previousEndsSentence = SENTENCE_END.test(text);
    previousWasShort = lineWidth(line) < measure * SHORT_LINE_RATIO && previousEndsSentence;

    if (current === null || startsParagraph) {
      current = [...segments];
      paragraphs.push(current);
    } else {
      joinLine(current, segments);
    }
  }

  return paragraphs
    .map((segments) => renderSegments(segments).replace(/\s+/g, ' ').trim())
    .filter((text) => text !== '')
    .join('\n\n');
}

/**
 * Mindestabstand von beiden Spaltenkanten, ab dem ein Titel eingerueckt ist.
 * Der Erstzeileneinzug (bis 15 pt) liegt sicher darunter.
 */
const SIDEBAR_TITLE_INSET = 20;

/** Groesstes Verhaeltnis der beiden Raender, das noch als mittig durchgeht. */
const SIDEBAR_TITLE_BALANCE = 2.5;

/**
 * Fuer Titel mit Stufenangabe gilt ein engeres Mass — siehe `RANKED_TITLE`.
 * Gemessen ueber alle Szenarien: die echten Sidebars dieser Form liegen bei
 * 1,22 bis 1,32, die Statblockleisten bei 1,58 bis 2,32.
 */
const RANKED_TITLE_BALANCE = 1.5;

/**
 * Paizos Eintragsleiste endet auf einer Stufe: `CREATURE 5`, `HAZARD 3`,
 * `OBSTACLE 1`. Sie fuellt ihr Feld von Rand zu Rand aus und ist damit kein
 * Sidebar — auch wenn sie in einem eingerueckten Statblockfeld steht und
 * dadurch mittig *wirkt*.
 *
 * Ein blosses Verbot waere zu grob: `SCALING WAVE 1` und
 * `SCALING ENCOUNTER EVENT 2` sind echte Sidebars derselben Form. Sie sind
 * aber sauber zentriert, waehrend die Leisten es nur ungefaehr sind.
 */
const RANKED_TITLE = /\s[–—-]?\d+$/;

/**
 * Erkennt den Titel eines Sidebar-Kastens an seiner **Zentrierung**.
 *
 * Schrift und Grad trennen ihn nicht: Paizo setzt den Sidebar-Titel
 * (`RUNNING A CHASE`) in derselben `GoodOT-CondBold` wie den Eintragstitel
 * (`INTO THE DRINK OBSTACLE 1`). Der Unterschied liegt im Satz — der Sidebar
 * ist ein eingerueckter Kasten mit mittigem Titel, der Eintrag laeuft im
 * Fliesstext und beginnt buendig an der Spaltenkante:
 *
 * ```
 * links rechts
 *    0    99  INTO THE DRINK OBSTACLE 1     <- Eintrag, buendig
 *   96   118  RUNNING A CHASE               <- Sidebar, mittig
 *  105    23  DOCKHAND CREATURE 0           <- Statblock im eingerueckten Feld
 * ```
 *
 * Beide Raender muessen deutlich sein: der Statblock steht zwar weit rechts,
 * fuellt seinen Kasten aber bis zum Rand aus und ist damit nicht zentriert.
 */
export function isSidebarTitle(block: Block): boolean {
  if (block.role !== 'box-heading' || !block.columnBounds) return false;
  const line = block.lines[0];
  const last = line?.runs[line.runs.length - 1];
  if (!line || !last) return false;

  const [from, to] = block.columnBounds;
  const leftGap = line.x - from;
  const rightGap = to - (last.x + last.width);
  if (leftGap < SIDEBAR_TITLE_INSET || rightGap < SIDEBAR_TITLE_INSET) return false;

  const balance = RANKED_TITLE.test(block.text.trim())
    ? RANKED_TITLE_BALANCE
    : SIDEBAR_TITLE_BALANCE;
  return Math.max(leftGap, rightGap) <= Math.min(leftGap, rightGap) * balance;
}

/** Satzende: danach faengt etwas Neues an, davor ist der Satz abgerissen. */
export const SENTENCE_END = /[.!?:]["”’'»)\]]*\s*$/;

/**
 * Ein fortgesetzter Satz laeuft klein weiter.
 *
 * Die Auszeichnung davor zaehlt nicht: Der zweite Teil kann mit `*kursiv*`
 * beginnen. In 8-01 lief `… of the *singing brass*` genau so weiter —
 * `*stone* creates these portals` —, und der Absatz blieb zerrissen, weil das
 * Sternchen kein Kleinbuchstabe ist.
 */
export const CONTINUES_SENTENCE = /^[*_]{0,2}["“'‘(]?\p{Ll}/u;

/** Rollen, die einen laufenden Absatz unterbrechen, ohne ihn zu beenden. */
const INTERRUPTIONS: ReadonlySet<BlockRole> = new Set([
  'box',
  'box-heading',
  'traits',
  'caption',
]);

/**
 * Kartenbeschriftungen stehen nicht in der Ausgabe und zaehlen deshalb nicht
 * gegen das Budget: zwischen den beiden Haelften eines Satzes kann eine ganze
 * Kartenseite liegen.
 */
const INVISIBLE: ReadonlySet<BlockRole> = new Set(['map-label']);

/** So viele eingeschobene Bloecke darf ein unterbrochener Absatz ueberspringen. */
const MAX_INTERRUPTIONS = 4;

function findOpenParagraph(result: Block[], next: Block): Block | undefined {
  if (!CONTINUES_SENTENCE.test(next.text)) return undefined;

  let skipped = 0;
  for (let i = result.length - 1; i >= 0 && skipped <= MAX_INTERRUPTIONS; i--) {
    const candidate = result[i]!;

    if (candidate.role === next.role || candidate.role === 'body') {
      if (!SENTENCE_END.test(candidate.text)) return candidate;
      // Ein abgeschlossener Block beendet die Suche — **ausser bei Kaesten**.
      // Zwischen den beiden Haelften eines Vorlesetextes steht regelmaessig
      // ein ganzer Seitenkasten derselben Rolle: In 8-01 trennte
      // `ADJUSTING DIFFICULTY` das `… starts to shake,` von seinem
      // `knocking glassware to the floor`.
      if (next.role !== 'box') return undefined;
      skipped++;
      continue;
    }

    if (INVISIBLE.has(candidate.role)) continue;
    // Eine Ueberschrift beendet den Absatz endgueltig.
    if (!INTERRUPTIONS.has(candidate.role)) return undefined;
    skipped++;
  }

  return undefined;
}

/**
 * Fuegt Absaetze zusammen, die der Satz zerschnitten hat.
 *
 * Fliesstext bricht am Spaltenende mitten im Satz um, und ein eingeschobener
 * Sidebar-Kasten trennt ihn zusaetzlich — im Ergebnis standen
 * `... slow them down,` und `giving the skiff more time ...` als zwei Absaetze
 * mit dem Kasten dazwischen.
 *
 * Zusammengefuegt wird nur, wenn der Satz erkennbar weiterlaeuft: der erste
 * Teil endet ohne Satzzeichen, der zweite beginnt klein.
 *
 * **Kaesten zaehlen seit dem 15.08.2026 mit.** Ein Vorlesetext bricht am
 * Spaltenende genauso mitten im Satz um wie Fliesstext, und dazwischen steht
 * dann ein Seitenkasten. Ueber die vier Hefte der Season 8 gemessen zieht die
 * Regel sieben Naehte — jede davon ein echter zerrissener Absatz.
 */
/**
 * Setzt die beiden Haelften aneinander.
 *
 * Ein Sonderfall lohnt die Muehe: Zerreisst der Satz **mitten in einer
 * Auszeichnung**, endet der erste Teil auf `*` und der zweite beginnt damit.
 * Stumpf aneinandergesetzt ergaebe das zwei Auszeichnungen mit Leerzeichen
 * dazwischen — aus `*singing brass bell*` wuerde
 * `*singing brass* *stone*`. Die Sternchen an der Naht fallen deshalb weg.
 */
function naht(erster: string, zweiter: string): string {
  const a = erster.trimEnd();
  const b = zweiter.trimStart();
  const offen = /(?<!\*)\*$/.test(a) && /^\*(?!\*)/.test(b);
  return offen ? `${a.slice(0, -1)} ${b.slice(1)}` : `${a} ${b}`;
}

export function mergeBrokenParagraphs(blocks: Block[]): Block[] {
  const result: Block[] = [];

  for (const block of blocks) {
    if (block.role === 'body' || block.role === 'statblock' || block.role === 'box') {
      const open = findOpenParagraph(result, block);
      if (open) {
        open.text = naht(open.text, block.text);
        continue;
      }
    }
    result.push(block);
  }

  return result;
}

/**
 * Kuerzester Text, der noch als Kasten durchgeht. Die Formularseiten am Ende
 * eines Szenarios setzen ihre Feldbeschriftungen in derselben Schrift; als
 * eigene Datei waere ein `-2` nur Rauschen.
 */
const MIN_BOX_LENGTH = 40;

/**
 * Schaerft die Rolle eines Kastenblocks nach. Vorlesetext, Probenergebnisse und
 * Formularschnipsel teilen sich dieselbe Schrift und lassen sich erst am
 * fertigen Text auseinanderhalten.
 */
export function refineRole(block: Block): BlockRole {
  if (block.role !== 'box') return block.role;
  if (looksLikeCheckResult(block.text)) return 'check-result';
  if (looksLikeStatblock(block.text)) return 'statblock';
  // Nichts geht verloren: zu kurze Kaesten wandern in den Fliesstext.
  return block.text.trim().length >= MIN_BOX_LENGTH ? 'box' : 'body';
}
