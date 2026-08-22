import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildBlocks,
  buildLines,
  dedupeRuns,
  detectColumns,
  mergeBrokenParagraphs,
  refineRole,
  renderBlock,
} from './layout.ts';
import {
  countLigatures,
  countUnmappedGlyphs,
  extractRuns,
  fontEncodingAgreement,
  neueUnresolvedFonts,
  resolveRunText,
  type UnresolvedFonts,
} from './runs.ts';
import { runRole } from './roles.ts';
import { dropRunningHeads, findRunningHeads, titleFromHeads } from './headers.ts';
import { buildProfile } from './profile.ts';
import { detectDesignation } from './season.ts';
import type { Scenario } from './scenario.ts';
import type { Block, TextRun } from './types.ts';

export interface ExtractOptions {
  /**
   * Zusaetzliche Parameter fuer `pdfjs.getDocument` — Worker, Schriftpfade,
   * Systemschriften.
   *
   * Sie kommen von aussen herein, weil sie im Browser durch
   * `foundry.utils.getRoute` gehen muessen und diese Schicht von Foundry
   * nichts wissen darf. In Node genuegt ein leeres Objekt.
   */
  dokumentParameter?: Record<string, unknown>;
  /** Name der Quelldatei, nur fuer das Schriftprofil. */
  quelle?: string;
  /** Wird nach jeder gelesenen Seite gerufen. */
  fortschritt?: (seite: number, von: number) => void;
  /** Zaehlt Schriftverweise, die sich nicht aufloesen liessen. */
  unresolved?: UnresolvedFonts;
}

/**
 * Nach so vielen Seiten wird der Faden kurz freigegeben.
 *
 * Das Zerlegen des PDFs laeuft im Worker, die Schleife ueber den
 * Operatorenstrom aber im Hauptfaden — ohne diese Pause steht die Oberflaeche
 * bei einem dreissigseitigen Heft mehrere Sekunden.
 */
const YIELD_EVERY = 3;

function atmen(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

export async function extractScenario(
  data: Uint8Array,
  fallbackTitle: string,
  options: ExtractOptions = {},
): Promise<Scenario> {
  const unresolved = options.unresolved ?? neueUnresolvedFonts();

  // `data.slice()` gibt pdf.js eine **Kopie**. Der Grund ist keine Vorsicht,
  // sondern eine Eigenheit: pdf.js reicht den Puffer an seinen Worker weiter
  // und loest ihn dabei ab. Wer danach noch einmal auf die uebergebenen Bytes
  // sieht, bekommt "detached ArrayBuffer" — und die Bilder brauchen genau das,
  // sie laufen ein zweites Mal ueber dasselbe PDF.
  //
  // In Node faellt das nicht auf, weil dort kein echter Worker laeuft; im
  // Extractor gibt es diese Zeile deshalb nicht.
  const doc = await pdfjs.getDocument({ data: data.slice(), ...options.dokumentParameter }).promise;

  const perPage: Array<{ runs: TextRun[]; width: number; height: number }> = [];
  const allRuns: TextRun[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const runs = await extractRuns(page, pageNumber, unresolved);
    const viewport = page.getViewport({ scale: 1 });
    perPage.push({ runs, width: viewport.width, height: viewport.height });
    allRuns.push(...runs);
    page.cleanup();
    options.fortschritt?.(pageNumber, doc.numPages);
    if (pageNumber % YIELD_EVERY === 0) await atmen();
  }

  // Die Reparatur der ToUnicode-Tabelle braucht den Blick auf alle Seiten,
  // deshalb erst jetzt.
  const agreement = fontEncodingAgreement(allRuns);
  const repairs = { repariert: 0 };
  for (const run of allRuns) run.text = resolveRunText(run, agreement, repairs);

  // Kolumnentitel und -fuss zeigen sich erst im Blick ueber alle Seiten.
  // Das Wasserzeichen steht ebenfalls in jedem Seitenrand und wuerde die Suche
  // gewinnen, deshalb erst die verworfenen Rollen aussortieren.
  const pageHeight = perPage[0]?.height ?? 0;
  const heads = findRunningHeads(
    allRuns.filter((run) => runRole(run) !== 'drop'),
    pageHeight,
  );
  const title = titleFromHeads(allRuns, heads, fallbackTitle);

  const blocks: Block[] = [];
  const pages: Array<{ width: number; height: number; columns: number }> = [];

  for (const { runs, width, height } of perPage) {
    const kept = dedupeRuns(
      dropRunningHeads(runs, heads).filter(
        (run) => runRole(run) !== 'drop' && run.text.trim() !== '',
      ),
    );
    if (kept.length === 0) continue;

    const columns = detectColumns(kept, width);
    pages.push({ width, height, columns: columns.length });

    const lines = buildLines(kept, columns);
    for (const block of buildBlocks(lines)) {
      block.text = renderBlock(block);
      block.role = refineRole(block);
      // Die Spaltenkanten entscheiden spaeter, ob ein Kastentitel zentriert
      // steht (Sidebar) oder buendig links (Eintrag im Fliesstext).
      block.columnBounds = columns[block.column];
      if (block.text.trim() !== '') blocks.push(block);
    }
  }

  await doc.destroy();

  const stitched = mergeBrokenParagraphs(blocks);

  return {
    title,
    pageCount: perPage.length,
    blocks: stitched,
    designation: detectDesignation(stitched),
    profile: buildProfile({
      title,
      source: options.quelle ?? fallbackTitle,
      runs: allRuns,
      blocks: stitched,
      pages,
      agreement,
      chars: {
        gesamt: allRuns.reduce((sum, run) => sum + run.glyphs.length, 0),
        ohneZuordnung: countUnmappedGlyphs(allRuns),
        reparierteSatzzeichen: repairs.repariert,
        ligaturen: countLigatures(allRuns),
      },
    }),
  };
}
