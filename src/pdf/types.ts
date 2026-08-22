/** Ein einzelnes Zeichen, wie es im PDF-Inhaltsstrom steht. */
export interface Glyph {
  /** Was pdf.js aus der ToUnicode-Tabelle liest — nicht immer korrekt. */
  unicode: string;
  /** Zeichencode im (meist Subset-)Font, zur Reparatur der ToUnicode-Tabelle. */
  fontChar: number;
  isSpace: boolean;
}

/**
 * Ein zusammenhaengender Textlauf an einer festen Stelle der Seite.
 * Entsteht aus genau einem `showText`-Operator.
 */
export interface TextRun {
  page: number;
  /** Linke Kante in PDF-Punkten, Ursprung links unten. */
  x: number;
  /** Grundlinie in PDF-Punkten, Ursprung links unten. */
  y: number;
  width: number;
  /** Schriftgrad in Punkt, bereits mit allen Matrizen skaliert. */
  size: number;
  /** Echter Fontname, z. B. `SabonLTStd-Roman`. */
  font: string;
  glyphs: Glyph[];
  /** Aus den Glyphen aufgeloester Text; siehe `resolveRunText`. */
  text: string;
}

/** Eine Satzzeile: alle Laeufe auf derselben Grundlinie einer Spalte. */
export interface Line {
  page: number;
  column: number;
  y: number;
  x: number;
  runs: TextRun[];
}

export type BlockRole =
  | 'heading'
  | 'subheading'
  /** Titelzeile eines Kastens, einer Tabelle oder einer Aktivitaet. */
  | 'box-heading'
  /** Bildunterschrift, etwa unter einem Figurenportraet. */
  | 'caption'
  | 'traits'
  | 'body'
  | 'box'
  | 'statblock'
  | 'check-result'
  | 'map-label';

/** Ein Absatz oder Kasten: aufeinanderfolgende Zeilen gleicher Rolle. */
export interface Block {
  role: BlockRole;
  page: number;
  column: number;
  lines: Line[];
  /** Gliederungstiefe bei Ueberschriften; sonst nicht gesetzt. */
  level?: 1 | 2 | 3;
  /** Kanten der Spalte, in der der Block steht — als [links, rechts]. */
  columnBounds?: [number, number];
  /** Fertiger Markdown-Text des Blocks. */
  text: string;
}

export interface PageGeometry {
  page: number;
  width: number;
  height: number;
  /** Spaltengrenzen als [links, rechts] in PDF-Punkten. */
  columns: Array<[number, number]>;
}
