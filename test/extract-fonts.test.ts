import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractRuns, neueUnresolvedFonts } from '../src/pdf/runs.ts';

const OPS = pdfjs.OPS;

/**
 * Baut den Operatorenstrom einer Seite mit genau einem Textlauf nach.
 */
function operatoren(fontRef: string): { fnArray: number[]; argsArray: unknown[] } {
  return {
    fnArray: [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText],
    argsArray: [
      [],
      [fontRef, 10],
      [1, 0, 0, 1, 100, 700],
      [[{ unicode: 'A', fontChar: 'A', isSpace: false, width: 500 }]],
      [],
    ],
  };
}

/**
 * Eine Seite, deren Schriftobjekt erst **nach** einer Verzoegerung bereitsteht
 * — so verhaelt sich pdf.js im Browser mit echtem Worker.
 *
 * `get(ref)` ohne Rueckruf wirft solange, genau wie das Original
 * ("Requesting object that isn't resolved yet"). `get(ref, cb)` meldet sich,
 * sobald es da ist.
 */
function seiteMitVerzoegerterSchrift(name: string, verzoegerung: number) {
  let bereit = false;
  const wartende: Array<() => void> = [];
  setTimeout(() => {
    bereit = true;
    for (const cb of wartende) cb();
  }, verzoegerung);

  return {
    getOperatorList: async () => operatoren('g_d0_f1'),
    getViewport: () => ({ width: 612, height: 792 }),
    cleanup: () => {},
    commonObjs: {
      get(_ref: string, callback?: () => void): unknown {
        if (callback) {
          if (bereit) callback();
          else wartende.push(callback);
          return undefined;
        }
        if (!bereit) throw new Error("Requesting object that isn't resolved yet");
        return { name, fontMatrix: [0.001, 0, 0, 0.001, 0, 0] };
      },
    },
  };
}

/**
 * Das groesste Risiko der ganzen Portierung: `roles.ts` entscheidet
 * ausschliesslich am Schriftnamen. Kommt statt `SabonLTStd-Roman` die nackte
 * Referenz `g_d0_f1` an, faellt jede Ueberschrift auf Fliesstext zurueck — und
 * zwar lautlos, denn kein einziges Zeichen fehlt. In Node faellt das nicht auf,
 * weil pdf.js dort im selben Faden laeuft und sofort antwortet.
 */
describe('extractRuns — Schriften aufloesen', () => {
  it('wartet auf Schriften, die erst verzoegert ankommen', async () => {
    const page = seiteMitVerzoegerterSchrift('SabonLTStd-Roman', 30);
    const unresolved = neueUnresolvedFonts();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs = await extractRuns(page as any, 1, unresolved);

    expect(runs).toHaveLength(1);
    expect(runs[0]!.font).toBe('SabonLTStd-Roman');
    expect(unresolved.anzahl).toBe(0);
  });

  it('meldet es, wenn eine Schrift gar nicht kommt', async () => {
    // Verzoegerung jenseits des Zeitlimits gibt es hier nicht; stattdessen
    // eine Seite, deren Schriftobjekt nie eintrifft, aber der Rueckruf sofort
    // ausgeloest wird — der Fall "aufgeloest, aber ohne Namen".
    const page = {
      getOperatorList: async () => operatoren('g_d0_f1'),
      getViewport: () => ({ width: 612, height: 792 }),
      cleanup: () => {},
      commonObjs: {
        get(_ref: string, callback?: () => void): unknown {
          if (callback) {
            callback();
            return undefined;
          }
          return undefined;
        },
      },
    };
    const unresolved = neueUnresolvedFonts();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs = await extractRuns(page as any, 1, unresolved);

    expect(runs[0]!.font).toBe('g_d0_f1');
    expect(unresolved.anzahl).toBeGreaterThan(0);
    expect([...unresolved.verweise]).toContain('g_d0_f1');
  });
});
