import { isSidebarTitle } from './layout.ts';
import type { Block } from './types.ts';

/**
 * Kastenerkennung: was im Satz als eingerahmter Block steht — Vorlesetext,
 * Sidebar, Aktivitaet, Probenergebnisliste — wird hier zu je einem Dokument
 * zusammengefasst.
 *
 * Herkunft: `src/emit.ts` des PaizoPFSScenarioTextExtractor. Dort stand der
 * Teil zwischen dem Schreiben von Dateien, mit dem er nichts zu tun hat.
 * Hier steht er allein und ist damit das, was er immer war: reine Logik auf
 * Bloecken, ohne Kenntnis davon, wohin das Ergebnis spaeter geht.
 */

const BOX_PARTS: ReadonlySet<Block['role']> = new Set([
  'box',
  'box-heading',
  'traits',
  'check-result',
  'statblock',
]);

/** Groesster Abstand, den zwei Teile desselben Kastens haben duerfen. */
const BOX_PART_GAP = 40;

function isDirectlyBelow(previous: Block, next: Block): boolean {
  const bottom = previous.lines[previous.lines.length - 1]?.y ?? 0;
  const top = next.lines[0]?.y ?? 0;
  const gap = bottom - top;
  return gap > 0 && gap <= BOX_PART_GAP;
}

export interface BoxDocument {
  /** Stelle im Blockstrom, an der der Kasten beginnt. */
  index: number;
  /** Alle Bloecke des Kastens — nach einem Umbruch nicht mehr fortlaufend. */
  indices: number[];
  parts: Block[];
  title?: string;
  /**
   * Ein eingerueckter Kasten mit mittigem Titel. Er steht im Satz neben dem
   * Text und gehoert im Journal ans Kapitelende; ein Eintrag mit buendigem
   * Titel (`INTO THE DRINK OBSTACLE 1`) bleibt dagegen im Fliesstext stehen.
   */
  sidebar: boolean;
}

/**
 * Fasst zusammen, was im Layout ein Kasten ist.
 *
 * Ein Kasten besteht selten aus einem Block: ueber dem Vorlesetext steht eine
 * Titelzeile, darin kann eine Aktivitaet mit eigenem Titel und
 * Merkmalsplaketten stecken. Erst zusammen ergeben sie das, was ein
 * Spielleiter als einen Kasten liest.
 */
export function groupBoxes(blocks: Block[]): BoxDocument[] {
  const documents: BoxDocument[] = [];
  let i = 0;

  while (i < blocks.length) {
    if (!BOX_PARTS.has(blocks[i]!.role)) {
      i++;
      continue;
    }

    const start = i;
    const parts: Block[] = [];
    const indices: number[] = [];
    while (i < blocks.length && BOX_PARTS.has(blocks[i]!.role)) {
      const block = blocks[i]!;
      const previous = parts[parts.length - 1];
      // Nur was unmittelbar untereinander in derselben Spalte steht, gehoert
      // zum selben Kasten. Sonst zieht eine Tabelle in Spalte 1 den Kasten
      // aus Spalte 2 an sich.
      if (
        previous &&
        (block.page !== previous.page ||
          block.column !== previous.column ||
          !isDirectlyBelow(previous, block))
      ) {
        break;
      }
      // Ein Titel mitten im Kasten kuendigt nur dann eine Aktivitaet an, wenn
      // der Kasten ein **Sidebar** ist — nur dort steckt eine Aktivitaet drin
      // (`GUIDE CIVILIANS` in `GUIDING CIVILIANS`). Eintraege im Fliesstext
      // folgen dagegen als Geschwister aufeinander: ohne diesen Schnitt zog
      // `INTO THE DRINK OBSTACLE 1` die drei folgenden Hindernisse in sich
      // hinein, und versprengter Vorlesetext verschluckte den Titel des
      // Kastens darunter.
      if (previous && block.role === 'box-heading' && !isSidebarTitle(parts[0]!)) break;
      parts.push(block);
      indices.push(i);
      i++;
    }

    // Ohne Vorlesetext ist es kein Kasten, sondern etwa eine Tabellen-
    // ueberschrift — die gehoert in den Fliesstext.
    if (!parts.some((part) => part.role === 'box')) continue;

    const first = parts[0]!;
    documents.push({
      index: start,
      indices,
      parts,
      title: first.role === 'box-heading' ? first.text.replace(/\n+/g, ' ') : undefined,
      sidebar: isSidebarTitle(first),
    });
  }

  return mergeContinuations(documents);
}

/** Satzende: danach faengt etwas Neues an, davor ist der Satz abgerissen. */
const SENTENCE_END = /[.!?:]["”’'»)\]]*\s*$/;

/**
 * Ein fortgesetzter Satz laeuft klein weiter. Ohne diese Bedingung haengt sich
 * der erste Kasten einer Seite an das Impressum der vorigen, das ebenfalls ohne
 * Satzpunkt endet (`... Woodinville, WA 98072-4572 paizo.com`).
 */
const CONTINUES_SENTENCE = /^["“'‘(]?\p{Ll}/u;

/**
 * Fuegt Kaesten zusammen, die ueber einen Spalten- oder Seitenumbruch laufen.
 *
 * Im Satz endet der Kasten unten in der Spalte und laeuft oben in der naechsten
 * weiter — mitten im Satz. Ohne diese Naht zerfaellt ein Vorlesetext von 2150
 * Zeichen in zwei Bruchstuecke, von denen keines fuer sich lesbar ist.
 *
 * Ein eigener Titel beendet die Fortsetzung: er kuendigt einen neuen Kasten an.
 */
function mergeContinuations(documents: BoxDocument[]): BoxDocument[] {
  const merged: BoxDocument[] = [];

  for (const document of documents) {
    const head = document.parts[0];
    const open =
      head?.role === 'box' && document.title !== undefined
        ? undefined
        : head?.role === 'box' && CONTINUES_SENTENCE.test(head.text)
          ? findOpenBox(merged, head)
          : undefined;

    if (open) {
      const { target: previous, tail } = open;
      // Der Satz laeuft weiter — kein Absatzumbruch, sondern ein Leerzeichen.
      // Nur die Nahtstelle wird zusammengezogen: ein `\s+` ueber den ganzen
      // Text wuerde die Absaetze beider Teile einebnen.
      //
      // Der zusammengefuegte Text kommt als **Kopie** in den Kasten. Wuerde
      // `tail` selbst beschrieben, veraenderte `groupBoxes` die Bloecke des
      // Szenarios, und ein zweiter Aufruf saehe einen anderen Stand: seit das
      // Journal zweimal gebaut wird (mit und ohne Actor-Verweise), fiel das
      // als zusaetzlicher Vorlesekasten in der zweiten Fassung auf.
      previous.parts[previous.parts.indexOf(tail)] = {
        ...tail,
        text: `${tail.text.trimEnd()} ${head!.text.trimStart()}`,
      };
      previous.parts.push(...document.parts.slice(1));
      previous.indices.push(...document.indices);
      continue;
    }
    merged.push(document);
  }

  return merged;
}

/** So weit wird nach dem angebrochenen Kasten zurueckgesucht. */
const CONTINUATION_LOOKBACK = 3;

/**
 * Sucht den Kasten, den dieser Text fortsetzt.
 *
 * Nicht immer ist das der unmittelbare Vorgaenger: zwischen dem Fuss der einen
 * und dem Kopf der naechsten Spalte kann ein eingeschobener Sidebar-Kasten
 * stehen — auf Seite 3 trennt `WHERE ON GOLARION?` den Vorlesetext von seiner
 * eigenen Fortsetzung.
 */
function findOpenBox(
  merged: BoxDocument[],
  head: Block,
): { target: BoxDocument; tail: Block } | undefined {
  const from = Math.max(0, merged.length - CONTINUATION_LOOKBACK);

  for (let i = merged.length - 1; i >= from; i--) {
    const candidate = merged[i]!;
    const tail = lastBoxPart(candidate);
    if (!tail) continue;
    if (continuesElsewhere(tail, head) && !SENTENCE_END.test(tail.text)) {
      return { target: candidate, tail };
    }
  }

  return undefined;
}

/**
 * Ein Kasten setzt sich nur ueber einen Umbruch hinweg fort: in der naechsten
 * Spalte oder auf der naechsten Seite. Zwei Kaesten untereinander in derselben
 * Spalte sind zwei Kaesten, auch wenn der erste ohne Punkt endet.
 */
function continuesElsewhere(tail: Block, head: Block): boolean {
  if (head.page > tail.page) return true;
  return head.page === tail.page && head.column > tail.column;
}

/**
 * Der letzte Vorlesetext-Block eines Kastens. Er entscheidet, ob der Kasten
 * abgeschlossen ist — nur er traegt den Satz, an dem der Umbruch haengt.
 */
function lastBoxPart(document: BoxDocument): Block | undefined {
  for (let i = document.parts.length - 1; i >= 0; i--) {
    const part = document.parts[i]!;
    if (part.role === 'box') return part;
  }
  return undefined;
}

