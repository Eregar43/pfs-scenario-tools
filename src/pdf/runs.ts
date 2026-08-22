import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Glyph, TextRun } from './types.ts';

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Beginn des Unicode-Bereichs zur privaten Verwendung. */
const PUA_START = 0xe000;

/** Matrizenprodukt in der Reihenfolge von PDF: erst `m1`, dann `m2`. */
function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

interface TextState {
  font: string;
  fontSize: number;
  fontMatrixScale: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
}

function initialTextState(): TextState {
  return {
    font: '',
    fontSize: 0,
    fontMatrixScale: 0.001,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
  };
}

/**
 * Zaehlwerk fuer Schriftverweise, die sich nicht aufloesen liessen.
 *
 * Jeder Eintrag hier bedeutet, dass ein Textlauf statt `SabonLTStd-Roman`
 * etwas wie `g_d0_f1` als Schriftnamen bekommen hat — und weil `roles.ts`
 * ausschliesslich am Schriftnamen entscheidet, faellt der Lauf dann auf
 * Fliesstext zurueck. Anzahl grosser als null heisst: dem Ergebnis ist nicht
 * zu trauen.
 */
export interface UnresolvedFonts {
  anzahl: number;
  verweise: Set<string>;
}

export function neueUnresolvedFonts(): UnresolvedFonts {
  return { anzahl: 0, verweise: new Set() };
}

/**
 * Wartet, bis alle Schriften der Seite geladen sind.
 *
 * In Node laeuft pdf.js im selben Faden, und `commonObjs.get(ref)` liefert
 * sofort. Im Browser mit echtem Worker kommen die Schriftobjekte dagegen
 * **asynchron** an: ein `get(ref)` auf ein noch nicht aufgeloestes Objekt
 * wirft, und der Rueckfall im Aufrufer liefert dann die nackte Referenz.
 *
 * Das waere ein lautloser Totalausfall — der Text kaeme vollstaendig an, nur
 * ohne jede Gliederung. Deshalb werden die Verweise vor dem Durchlauf
 * eingesammelt und einzeln abgewartet; `commonObjs.get` mit Rueckruf meldet
 * sich, sobald das Objekt da ist. Ein Zeitlimit verhindert, dass ein einzelnes
 * fehlendes Objekt den ganzen Lauf anhaelt.
 */
async function awaitFonts(
  page: pdfjs.PDFPageProxy,
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: typeof pdfjs.OPS,
): Promise<void> {
  const refs = new Set<string>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.setFont) continue;
    const ref = (ops.argsArray[i] as unknown[])[0];
    if (typeof ref === 'string') refs.add(ref);
  }

  await Promise.all([...refs].map((ref) => awaitObject(page.commonObjs, ref)));
}

/** Zeitlimit je Schriftobjekt. */
const FONT_RESOLVE_TIMEOUT = 20_000;

function awaitObject(store: { get(name: string, callback: () => void): void }, name: string): Promise<void> {
  return new Promise((done) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done();
    };
    const timer = setTimeout(finish, FONT_RESOLVE_TIMEOUT);
    try {
      store.get(name, finish);
    } catch {
      finish();
    }
  });
}

/**
 * Laeuft den Inhaltsstrom einer Seite ab und liefert jeden Textlauf mit seiner
 * Position.
 *
 * `getTextContent()` von pdf.js waere einfacher, fasst Laeufe aber nach eigenen
 * Regeln zusammen und wirft dabei den Zeichencode weg — genau den brauchen wir,
 * um die kaputte ToUnicode-Tabelle der Paizo-PDFs zu reparieren
 * (siehe `resolveRunText`).
 */
export async function extractRuns(
  page: pdfjs.PDFPageProxy,
  pageNumber: number,
  unresolved?: UnresolvedFonts,
): Promise<TextRun[]> {
  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;

  await awaitFonts(page, ops, OPS);

  const runs: TextRun[] = [];
  let ctm: Matrix = IDENTITY;
  const ctmStack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let state = initialTextState();
  const stateStack: TextState[] = [];

  /**
   * Der Rueckfall auf `ref` liefert einen Namen wie `g_d0_f1`, und daran
   * erkennt `roles.ts` keine Rolle mehr. Das darf nicht stillschweigend
   * passieren, deshalb wird es gezaehlt.
   */
  const unresolvedFont = (ref: string): string => {
    if (unresolved) {
      unresolved.anzahl++;
      unresolved.verweise.add(ref);
    }
    return ref;
  };

  const fontName = (ref: string): string => {
    try {
      const font = page.commonObjs.get(ref) as { name?: string } | undefined;
      return font?.name ?? unresolvedFont(ref);
    } catch {
      return unresolvedFont(ref);
    }
  };

  const fontMatrixScale = (ref: string): number => {
    try {
      const font = page.commonObjs.get(ref) as { fontMatrix?: number[] } | undefined;
      return font?.fontMatrix?.[0] ?? 0.001;
    } catch {
      return 0.001;
    }
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];

    switch (fn) {
      case OPS.save:
        ctmStack.push(ctm);
        stateStack.push({ ...state });
        break;

      case OPS.restore:
        ctm = ctmStack.pop() ?? IDENTITY;
        state = stateStack.pop() ?? initialTextState();
        break;

      case OPS.transform:
        ctm = mul(args as Matrix, ctm);
        break;

      case OPS.paintFormXObjectBegin:
        ctmStack.push(ctm);
        stateStack.push({ ...state });
        ctm = mul(args[0] as Matrix, ctm);
        break;

      case OPS.paintFormXObjectEnd:
        ctm = ctmStack.pop() ?? IDENTITY;
        state = stateStack.pop() ?? initialTextState();
        break;

      case OPS.beginText:
        tm = IDENTITY;
        tlm = IDENTITY;
        break;

      case OPS.setTextMatrix:
        tm = [...(args as Matrix)];
        tlm = [...(args as Matrix)];
        break;

      case OPS.setFont: {
        const ref = args[0] as string;
        state.font = fontName(ref);
        state.fontSize = args[1] as number;
        state.fontMatrixScale = fontMatrixScale(ref);
        break;
      }

      // pdf.js dreht das Vorzeichen von TL bereits um.
      case OPS.setLeading:
        state.leading = args[0] as number;
        break;

      case OPS.setLeadingMoveText:
        state.leading = -(args[1] as number);
        tlm = mul([1, 0, 0, 1, args[0] as number, args[1] as number], tlm);
        tm = [...tlm];
        break;

      case OPS.moveText:
        tlm = mul([1, 0, 0, 1, args[0] as number, args[1] as number], tlm);
        tm = [...tlm];
        break;

      case OPS.nextLine:
        tlm = mul([1, 0, 0, 1, 0, -state.leading], tlm);
        tm = [...tlm];
        break;

      case OPS.setCharSpacing:
        state.charSpacing = args[0] as number;
        break;

      case OPS.setWordSpacing:
        state.wordSpacing = args[0] as number;
        break;

      case OPS.setHScale:
        state.hScale = (args[0] as number) / 100;
        break;

      case OPS.setTextRise:
        state.rise = args[0] as number;
        break;

      case OPS.showText: {
        const raw = args[0] as Array<number | Record<string, unknown>>;
        const combined = mul(tm, ctm);
        const size = Math.abs(state.fontSize) * Math.hypot(combined[2], combined[3]);
        const glyphs: Glyph[] = [];
        let advance = 0;

        for (const entry of raw) {
          if (typeof entry === 'number') {
            // TJ-Korrektur: positive Werte ruecken nach links.
            advance -= (entry * state.fontSize) / 1000;
            continue;
          }
          const isSpace = entry.isSpace === true;
          glyphs.push({
            unicode: (entry.unicode as string | undefined) ?? '',
            fontChar: typeof entry.fontChar === 'string' ? entry.fontChar.charCodeAt(0) : -1,
            isSpace,
          });
          const width = (entry.width as number | undefined) ?? 0;
          advance +=
            width * state.fontMatrixScale * state.fontSize +
            state.charSpacing +
            (isSpace ? state.wordSpacing : 0);
        }
        advance *= state.hScale;

        if (glyphs.length > 0) {
          runs.push({
            page: pageNumber,
            x: combined[4],
            y: combined[5],
            width: Math.abs(advance * Math.hypot(combined[0], combined[1])),
            size,
            font: state.font,
            glyphs,
            text: '',
          });
        }

        tm = mul([1, 0, 0, 1, advance, 0], tm);
        break;
      }

      default:
        break;
    }
  }

  return runs;
}

/**
 * Anteil der Glyphen eines Fonts, deren Zeichencode zum gemeldeten Unicode
 * passt. Nur bei standardkodierten Fonts ist der Code als Ersatzquelle
 * brauchbar; viele Subset-Fonts vergeben ihre Codes frei.
 */
export function fontEncodingAgreement(runs: TextRun[]): Map<string, number> {
  const total = new Map<string, number>();
  const agree = new Map<string, number>();

  for (const run of runs) {
    for (const glyph of run.glyphs) {
      if (glyph.fontChar < PUA_START) continue;
      total.set(run.font, (total.get(run.font) ?? 0) + 1);
      if (String.fromCharCode(glyph.fontChar - PUA_START) === glyph.unicode) {
        agree.set(run.font, (agree.get(run.font) ?? 0) + 1);
      }
    }
  }

  const rates = new Map<string, number>();
  for (const [font, n] of total) rates.set(font, (agree.get(font) ?? 0) / n);
  return rates;
}

/**
 * Zaehlt Glyphen, zu denen das PDF ueberhaupt kein Zeichen liefert.
 *
 * Solche Glyphen verschwinden spurlos aus dem Ergebnis — der klassische Weg,
 * auf dem `find` zu `fnd` wird, wenn eine `fi`-Ligatur keine Rueckabbildung
 * hat. Im geprueften Szenario ist der Wert null; bei anderen Schriften kann er
 * es nicht sein, deshalb wird er gemeldet statt uebergangen.
 */
export function countUnmappedGlyphs(runs: TextRun[]): number {
  let count = 0;
  for (const run of runs) {
    for (const glyph of run.glyphs) {
      if (glyph.unicode === '') count++;
    }
  }
  return count;
}

/** Satzzeichen, die in den Paizo-PDFs als Leerzeichen ankommen. */
const REPAIRABLE = new Set(['.', ',', ';', ':', '!', '?']);

/** Ab dieser Uebereinstimmung gilt die Kodierung eines Fonts als Standard. */
const AGREEMENT_THRESHOLD = 0.8;

/**
 * Setzt den Text eines Laufs aus seinen Glyphen zusammen.
 *
 * Die Wasserzeichen-PDFs von Paizo liefern eine ToUnicode-Tabelle, in der
 * Satzzeichen auf das Leerzeichen zeigen — in einem 33-Seiten-Szenario betrifft
 * das ueber 400 Satzpunkte, die sonst spurlos verschwinden. Wo der Font
 * standardkodiert ist, ist der Zeichencode die verlaesslichere Quelle und wird
 * fuer genau diesen Fall vorgezogen.
 */
export function resolveRunText(
  run: TextRun,
  agreement: Map<string, number>,
  stats?: { repariert: number },
): string {
  const trustCodes = (agreement.get(run.font) ?? 0) >= AGREEMENT_THRESHOLD;
  let out = '';

  for (const glyph of run.glyphs) {
    if (trustCodes && glyph.unicode.trim() === '' && glyph.fontChar >= PUA_START) {
      const derived = String.fromCharCode(glyph.fontChar - PUA_START);
      if (REPAIRABLE.has(derived)) {
        out += derived;
        if (stats) stats.repariert++;
        continue;
      }
    }
    out += glyph.unicode;
  }

  return out;
}

/** Zaehlt Ligaturen: Glyphen, die mehr als ein Zeichen liefern. */
export function countLigatures(runs: TextRun[]): number {
  let count = 0;
  for (const run of runs) {
    for (const glyph of run.glyphs) {
      if ([...glyph.unicode].length > 1) count++;
    }
  }
  return count;
}
