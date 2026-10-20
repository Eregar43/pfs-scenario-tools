import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Linien, die das Heft **ueber** eine Karte zeichnet.
 *
 * Manches steht nicht im Kartenbild, sondern liegt als Vektorzeichnung
 * darueber: in 8-06 die weisse gestrichelte Flaeche der Falle bei A4, ihr
 * Rahmen und rote Trennlinien. Im Kartenbild fehlen sie deshalb; der
 * Spielleiter bekommt sie als Zeichnungen auf die Szene
 * (`world/kartenzeichnungen.ts`).
 *
 * Gelesen werden nur **gezogene** Linien. Flaechen (`fill`) sind auf einer
 * Kartenseite Seitenschmuck und Kastengruende.
 */

/** Eine gezogene Linie in Seitenpunkten, y nach oben. */
export interface Kartenlinie {
  page: number;
  /** Die Eckpunkte; Kurven gehen mit ihrem Endpunkt ein. */
  punkte: Array<{ x: number; y: number }>;
  /** Schliesst der Pfad sich (Rechteck, `closePath`)? */
  geschlossen: boolean;
  /** `#rrggbb` */
  farbe: string;
  /** Strichstaerke in Seitenpunkten. */
  breite: number;
  gestrichelt: boolean;
  /**
   * Die Bilder, die auf der Seite **vor** dieser Linie gemalt wurden. Nur
   * ueber diesen liegt sie; was vor dem Kartenbild gezeichnet ist, verdeckt
   * die Karte (in 8-06 ein brauner Rahmen unter der Karte).
   */
  ueber: readonly string[];
}

/** Die Nummern der Operatoren, wie pdf.js sie fuehrt (`pdfjs.OPS`). */
export type Operatoren = Readonly<Record<string, number>>;

type Matrix = readonly number[];

function multipliziere(a: Matrix, b: Matrix): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

function wende(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0]! * x + m[2]! * y + m[4]!, y: m[1]! * x + m[3]! * y + m[5]! };
}

/** pdf.js liefert Farben je nach Fassung als `#rrggbb` oder als drei Bytes. */
function alsFarbe(wert: unknown): string | undefined {
  if (typeof wert === 'string' && /^#[0-9a-f]{6}$/i.test(wert)) return wert.toLowerCase();
  const teile = Array.from((wert as ArrayLike<number> | undefined) ?? []);
  if (teile.length < 3) return undefined;
  return `#${teile
    .slice(0, 3)
    .map((teil) => Math.max(0, Math.min(255, Math.round(teil))).toString(16).padStart(2, '0'))
    .join('')}`;
}

interface Zustand {
  matrix: Matrix;
  farbe: string;
  breite: number;
  gestrichelt: boolean;
}

/**
 * Geht den Operatorenstrom einer Seite durch und sammelt die gezogenen
 * Linien. Rein und ohne pdf.js-Objekte, damit es sich testen laesst.
 *
 * Der Zeichenzustand (Matrix, Farbe, Staerke, Strichelung) wird mit
 * `save`/`restore` mitgefuehrt — ohne ihn landet eine Linie an der falschen
 * Stelle oder in der falschen Farbe.
 */
export function linienAusOperatoren(
  page: number,
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  ops: Operatoren,
): Kartenlinie[] {
  const name = new Map(Object.entries(ops).map(([schluessel, nummer]) => [nummer, schluessel]));
  const linien: Kartenlinie[] = [];
  const stapel: Zustand[] = [];
  let z: Zustand = { matrix: [1, 0, 0, 1, 0, 0], farbe: '#000000', breite: 1, gestrichelt: false };
  let pfad: { teile: number[]; koordinaten: number[] } | undefined;
  let gemalt: readonly string[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const op = name.get(fnArray[i]!) ?? '';
    const args = (argsArray[i] ?? []) as unknown[];

    if (/^paint.*Image/.test(op) && typeof args[0] === 'string') {
      gemalt = [...gemalt, args[0]];
      continue;
    }

    switch (op) {
      case 'save':
      case 'paintFormXObjectBegin':
        stapel.push(z);
        z = { ...z };
        if (op === 'paintFormXObjectBegin' && Array.isArray(args[0])) {
          z.matrix = multipliziere(z.matrix, args[0] as number[]);
        }
        continue;
      case 'restore':
      case 'paintFormXObjectEnd':
        z = stapel.pop() ?? z;
        continue;
      case 'transform':
        z.matrix = multipliziere(z.matrix, args as number[]);
        continue;
      case 'setLineWidth':
        z.breite = Number(args[0]) || 0;
        continue;
      case 'setDash':
        z.gestrichelt = Array.isArray(args[0]) && (args[0] as unknown[]).length > 0;
        continue;
      case 'setStrokeRGBColor':
      case 'setStrokeColor':
        z.farbe = alsFarbe(args.length === 1 ? args[0] : args) ?? z.farbe;
        continue;
      case 'setStrokeGray': {
        const grau = Math.round(Number(args[0]) * 255);
        z.farbe = alsFarbe([grau, grau, grau]) ?? z.farbe;
        continue;
      }
      case 'setGState':
        for (const [schluessel, wert] of (args[0] as Array<[string, unknown]>) ?? []) {
          if (schluessel === 'LW') z.breite = Number(wert) || 0;
          if (schluessel === 'D') {
            const muster = (wert as unknown[] | undefined)?.[0];
            z.gestrichelt = Array.isArray(muster) && muster.length > 0;
          }
        }
        continue;
      case 'constructPath':
        pfad = {
          teile: Array.from((args[0] as ArrayLike<number>) ?? []),
          koordinaten: Array.from((args[1] as ArrayLike<number>) ?? []),
        };
        continue;
      case 'stroke':
      case 'closeStroke':
        if (pfad) linien.push(...zerlege(page, pfad, z, op === 'closeStroke', ops, gemalt));
        pfad = undefined;
        continue;
      case 'endPath':
      case 'fill':
      case 'eoFill':
        pfad = undefined;
        continue;
      default:
        continue;
    }
  }
  return linien;
}

/** Ein Pfad aus `constructPath` in seine Teilpfade, je einer pro `moveTo`. */
function zerlege(
  page: number,
  pfad: { teile: number[]; koordinaten: number[] },
  z: Zustand,
  schliessen: boolean,
  ops: Operatoren,
  ueber: readonly string[],
): Kartenlinie[] {
  const ergebnis: Kartenlinie[] = [];
  // Strichstaerke mit der Matrix skalieren: Mittel der beiden Achsen.
  const skala = Math.sqrt(Math.abs(z.matrix[0]! * z.matrix[3]! - z.matrix[1]! * z.matrix[2]!));
  const neu = (): Kartenlinie => ({
    page,
    punkte: [],
    geschlossen: schliessen,
    farbe: z.farbe,
    breite: z.breite * skala,
    gestrichelt: z.gestrichelt,
    ueber,
  });
  let laufend = neu();
  const abschliessen = (): void => {
    if (laufend.punkte.length >= 2) ergebnis.push(laufend);
    laufend = neu();
  };

  let k = 0;
  const nimm = (anzahl: number): number[] => {
    const werte = pfad.koordinaten.slice(k, k + anzahl);
    k += anzahl;
    return werte;
  };
  for (const teil of pfad.teile) {
    if (teil === ops.moveTo) {
      abschliessen();
      const [x = 0, y = 0] = nimm(2);
      laufend.punkte.push(wende(z.matrix, x, y));
    } else if (teil === ops.lineTo) {
      const [x = 0, y = 0] = nimm(2);
      laufend.punkte.push(wende(z.matrix, x, y));
    } else if (teil === ops.curveTo) {
      const werte = nimm(6);
      laufend.punkte.push(wende(z.matrix, werte[4] ?? 0, werte[5] ?? 0));
    } else if (teil === ops.curveTo2 || teil === ops.curveTo3) {
      const werte = nimm(4);
      laufend.punkte.push(wende(z.matrix, werte[2] ?? 0, werte[3] ?? 0));
    } else if (teil === ops.closePath) {
      laufend.geschlossen = true;
    } else if (teil === ops.rectangle) {
      abschliessen();
      const [x = 0, y = 0, b = 0, h = 0] = nimm(4);
      laufend.punkte.push(
        wende(z.matrix, x, y),
        wende(z.matrix, x + b, y),
        wende(z.matrix, x + b, y + h),
        wende(z.matrix, x, y + h),
      );
      laufend.geschlossen = true;
    }
  }
  abschliessen();
  return ergebnis;
}

/**
 * Liest die gezogenen Linien der genannten Seiten.
 *
 * Ein eigener, kurzer Durchgang ueber wenige Seiten: Im Bilderlauf stehen die
 * Linien **nach** dem Kartenbild im Strom, das Bild ist dort schon
 * weitergereicht.
 */
export async function leseKartenlinien(
  data: Uint8Array,
  seiten: readonly number[],
  dokumentParameter: Record<string, unknown> = {},
): Promise<Kartenlinie[]> {
  if (seiten.length === 0) return [];
  // Kopie: pdf.js loest den uebergebenen Puffer ab (siehe `extract.ts`).
  const dokument = await pdfjs.getDocument({ data: data.slice(), ...dokumentParameter }).promise;
  const ops = pdfjs.OPS as unknown as Operatoren;
  const linien: Kartenlinie[] = [];
  try {
    for (const nummer of new Set(seiten)) {
      const seite = await dokument.getPage(nummer);
      const liste = await seite.getOperatorList();
      linien.push(...linienAusOperatoren(nummer, liste.fnArray, liste.argsArray, ops));
      seite.cleanup();
    }
  } finally {
    await dokument.destroy();
  }
  return linien;
}
