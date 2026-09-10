/**
 * Holt die Bilder aus dem PDF — Karten und freigestellte Figuren.
 *
 * Der Text allein traegt ein Szenario nicht an den Tisch: ohne die Karte laesst
 * sich die Begegnung in Foundry nicht stellen. pdfjs liefert die Bilder als
 * rohe Pixel; hier werden sie eingesammelt und nach ihrer Art getrennt.
 *
 * Gesucht wird wie ueberall in diesem Werkzeug **geometrisch**, nicht ueber
 * eine Liste: Ein Bild zaehlt, wenn es gross genug ist und hinter dem Deckblatt
 * steht. Welche Art es ist, sagt sein Alphakanal.
 *
 * Portiert aus dem Extractor. Zwei Dinge sind anders: die Pixel verlassen
 * diese Schicht **roh** (WebP macht der Browser, `sharp` gibt es hier nicht),
 * und statt eines Dateipfads kommen die PDF-Bytes herein, wie bei
 * `extractScenario`.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { sha256Hex } from './sha256.ts';
import type { Block } from './types.ts';

/**
 * Bildarten, wie pdfjs sie meldet (`ImageKind` im Quelltext des Systems).
 * Ein viertes gibt es nicht; alles andere wird uebergangen.
 */
export const GRAYSCALE = 1;
export const RGB = 2;
export const RGBA = 3;

/** Bytes je Bildpunkt, nach Art. */
export const CHANNELS: Record<number, number> = { [GRAYSCALE]: 1, [RGB]: 3, [RGBA]: 4 };

/**
 * Wozu ein Bild taugt.
 *
 * Eine Karte ist ein volles Rechteck — sie hat keinen Alphakanal, weil nichts
 * an ihr durchsichtig ist. Figurenbilder sind dagegen freigestellt und tragen
 * ihren Umriss im Alphakanal. Ueber alle vier Hefte der Season 8 trennt das
 * sauber: die sechs Karten kommen als `RGB`, die Portraits als `RGBA`.
 */
export type ImageRole = 'karte' | 'figur';

export function imageRole(kind: number): ImageRole {
  return kind === RGBA ? 'figur' : 'karte';
}

/**
 * Kleinste Flaeche, die noch zaehlt.
 *
 * Darunter liegen Zierrat und Signets — Wappen, Trennlinien, das Fusszeilen-
 * logo. Die kleinste echte Karte der dreizehn Hefte misst 1,22 Megapixel, das
 * kleinste Figurenbild 0,33; dazwischen ist viel Luft.
 */
export const MIN_PIXELS = 100_000;

/**
 * Kleinster Anteil verschiedener Farben, den ein Bild haben muss.
 *
 * Nicht jeder Seitenschmuck ist klein. Der Auftakt zu Unfettered Exploration
 * traegt einen Verlaufsbalken von 1732x552 Punkten, also fast ein Megapixel;
 * die Anhangsseiten von Shattered Sanctuaries liegen auf einer gemusterten
 * Flaeche von 957x1238. Beides ist Aufmachung, nicht Inhalt, und beides reisst
 * jede Groessenschwelle.
 *
 * Was sie verraet, ist ihre **Armut an Farben**. Gemessen an einer Stichprobe
 * (jeder siebte Punkt in beide Richtungen):
 *
 * | Bild | Anteil verschiedener Farben |
 * | --- | --- |
 * | Kopfleiste, Verlauf | 0,03 – 0,04 |
 * | Hintergrundmuster | 0,09 |
 * | Karten | 0,37 – 0,45 |
 * | Figuren | 0,39 |
 *
 * Dazwischen liegt ein Faktor vier. Der Schnitt liegt bei 0,2 — weit von
 * beiden Seiten entfernt.
 */
export const MIN_COLOURS = 0.2;

/**
 * Groesstes Seitenverhaeltnis, das noch ein Bild sein kann.
 *
 * Kapitelbalken sind breit und flach: die beiden in jedem Heft der Season 8
 * messen 1379x238 und 1379x186, also 5,8 und 7,4 zu eins. Das laengste echte
 * Bild der dreizehn Hefte kommt auf 2,6 — ein hochkant stehender Kartenteil.
 * Dazwischen ist nichts.
 */
export const MAX_ASPECT = 3;

/** Jeder wievielte Punkt in die Stichprobe geht. */
const SAMPLE_STEP = 7;

/**
 * Ab dieser Deckung zaehlt ein Punkt als vorhanden. Darunter ist er Luft.
 */
const OPAQUE_ENOUGH = 8;

/**
 * Der Anteil verschiedener Farben in einer Stichprobe des Bildes.
 *
 * **Durchsichtige Punkte bleiben ganz aussen vor** — sie zaehlen weder als
 * Farbe noch als Probe. Das ist keine Feinheit, sondern der Kern: Eine
 * freigestellte Illustration steht oft klein auf viel Luft. Der geflügelte
 * Dolch im Auftakt zu Immortal Influence fuellt keinen Fuenftel seiner
 * Bildflaeche; wuerde die Luft mitzaehlen, sackte sein Farbanteil unter jede
 * Schwelle und das Bild fiele als Zierrat durch.
 */
export function colourShare(
  width: number,
  height: number,
  kind: number,
  data: Uint8Array,
  step: number = SAMPLE_STEP,
): number {
  const channels = CHANNELS[kind];
  if (channels === undefined) return 0;

  const stride = width * channels;
  const seen = new Set<number>();
  let sampled = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = y * stride + x * channels;
      if (channels === 4 && data[at + 3]! < OPAQUE_ENOUGH) continue;
      const colour =
        channels === 1
          ? data[at]!
          : (data[at]! << 16) | (data[at + 1]! << 8) | data[at + 2]!;
      seen.add(colour);
      sampled++;
    }
  }

  return sampled === 0 ? 0 : seen.size / sampled;
}

/**
 * Wo ein Bild auf der Seite sitzt — in Punkten, wie die Textbloecke, also mit
 * der y-Achse **nach oben**. Erst damit laesst sich sagen, welche
 * Bildunterschrift dazugehoert.
 */
export interface Placement {
  left: number;
  right: number;
  /** Untere Kante; groessere Werte liegen weiter oben auf der Seite. */
  bottom: number;
  top: number;
}

export interface ExtractedImage {
  /** Seite, auf der es steht. */
  page: number;
  /** Lage auf der Seite; mehrfach gezeichnet zaehlt das erste Vorkommen. */
  at: Placement;
  /** Name des Bildobjekts im PDF — nur fuer die Fehlersuche. */
  name: string;
  width: number;
  height: number;
  kind: number;
  role: ImageRole;
  /** Die rohen Pixel, zeilenweise, `CHANNELS[kind]` Bytes je Punkt. */
  data: Uint8Array;
}

/**
 * Ob an dieser Stelle des Bildes Farbe liegt.
 *
 * Die Stelle kommt in Seitenpunkten und wird auf das Punkteraster des Bildes
 * umgerechnet. Die Bildmatrix spiegelt die y-Achse, deshalb die Umkehrung.
 */
export function opaqueAt(
  image: RawImage,
  at: Placement,
  x: number,
  y: number,
): boolean {
  const channels = CHANNELS[image.kind];
  if (channels === undefined) return false;
  if (channels !== 4) return true;

  const u = Math.floor(((x - at.left) / (at.right - at.left)) * image.width);
  const v = Math.floor(((at.top - y) / (at.top - at.bottom)) * image.height);
  if (u < 0 || v < 0 || u >= image.width || v >= image.height) return false;

  return image.data[(v * image.width + u) * 4 + 3]! >= OPAQUE_ENOUGH;
}

/**
 * Ob Kartenbeschriftungen **auf** dem Bild stehen.
 *
 * Der Alphakanal allein traegt die Trennung von Karte und Figur nicht mehr:
 * In 8-06 liegt die Schlachtkarte `The Abandoned Mine` als RGBA im PDF —
 * durchsichtig um den unregelmaessigen Hoehlenumriss — und lief als Figur,
 * es entstand keine Szene. Was eine Karte sicher verraet, sind ihre
 * Beschriftungen: Raumkennungen, `1 SQUARE = 5 FEET`, die Ortsnamen der
 * Uebersicht. Figuren tragen keine. Gezaehlt wird nur eine Beschriftung auf
 * deckenden Punkten, denn das Rechteck einer freigestellten Figur reicht
 * weit ueber ihren Umriss hinaus und kann eine Nachbarkarte ueberlappen.
 */
export function traegtKartenbeschriftung(
  image: RawImage,
  at: Placement,
  labels: Block[],
): boolean {
  for (const block of labels) {
    const line = block.lines[0];
    if (!line) continue;
    if (line.x < at.left || line.x > at.right || line.y < at.bottom || line.y > at.top) continue;
    if (opaqueAt(image, at, line.x, line.y)) return true;
  }
  return false;
}

/**
 * Ob das Bild der **Hintergrund** eines Kastens ist statt eine Abbildung.
 *
 * Sidebars liegen auf einer getoenten Flaeche, und die kommt als gewoehnliches
 * Bild daher: im Auftakt zur Season 8 ein brauner Grund von 554x652 Punkten
 * unter `WHERE ON GOLARION?` und einer von 554x201 unter
 * `ADJUSTING DIFFICULTY`. Fuer jede Groessen- und Farbschwelle sehen sie aus
 * wie eine Abbildung.
 *
 * Was sie verraet: **auf ihnen steht Text**. Das allein genuegt aber nicht —
 * auch neben einer freigestellten Figur steht Text, und ihr Rechteck reicht
 * weit ueber ihren Umriss hinaus. Der Unterschied ist, **wo** der Text liegt:
 * beim Hintergrund auf der Farbe, bei der Figur in der Luft daneben.
 */
export function isBackdrop(image: RawImage, at: Placement, blocks: Block[]): boolean {
  let onColour = 0;
  for (const block of blocks) {
    // Eine Bildunterschrift steht auf dem Bild, das sie benennt — in 8-06
    // sitzt `Dagur Hawksight` unten auf dem Portraet, auf deckenden Punkten,
    // und das Portraet fiel als Kastengrund heraus. Ein Kastengrund traegt
    // nie eine Bildunterschrift.
    if (block.role === 'caption') continue;
    const line = block.lines[0];
    if (!line) continue;
    if (line.x < at.left || line.x > at.right || line.y < at.bottom || line.y > at.top) continue;
    if (opaqueAt(image, at, line.x, line.y)) onColour++;
  }
  return onColour > 0;
}

export interface ImageOptions {
  /**
   * Erste Seite, die zaehlt. Davor stehen Deckblatt und Kopfleiste: allein auf
   * Seite 1 liegen sechs Bilder ueber einem halben Megapixel, und die
   * Kopfleiste auf Seite 2 (2208x617) steht in allen vier Heften der Season 8
   * identisch. Das Inhaltsverzeichnis nennt die Seite, ab der es losgeht.
   */
  fromPage: number;
  /** Letzte Seite, die zaehlt; dahinter stehen Impressum und Meldeboegen. */
  toPage?: number;
  minPixels?: number;
  minColours?: number;
  maxAspect?: number;
  /**
   * Der Text des Szenarios. Ohne ihn laesst sich ein Kastenhintergrund nicht
   * von einer Abbildung unterscheiden.
   */
  blocks?: Block[];
  /**
   * Zusaetzliche Parameter fuer `pdfjs.getDocument` — Worker, Schriftpfade.
   * Kommen von aussen herein, weil sie im Browser durch
   * `foundry.utils.getRoute` gehen muessen und diese Schicht von Foundry
   * nichts wissen darf.
   */
  dokumentParameter?: Record<string, unknown>;
  /** Wird nach jeder gelesenen Seite gerufen. */
  fortschritt?: (seite: number, von: number) => void;
}

/** Bildobjekte im Operatorenstrom von pdfjs. */
const PAINT_IMAGE = /^paint.*Image/;

/** Ein Bild, wie pdfjs es nach dem Dekodieren herausgibt. */
interface RawImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array;
}

interface ObjectStore {
  get(name: string, callback?: (value: unknown) => void): unknown;
}

/**
 * Laengste Wartezeit auf ein Bild. Sie greift nur, wenn pdfjs ein Objekt gar
 * nicht mehr liefert; ohne sie stuende der Lauf dann still.
 */
const RESOLVE_TIMEOUT = 20_000;

/**
 * Holt ein Bildobjekt und **wartet**, bis es dekodiert ist.
 *
 * Der Griff ohne Rueckruf wirft `Requesting object that isn't resolved yet`,
 * sobald das Bild noch im Arbeiter steckt — und das trifft nicht etwa
 * Nebensaechliches, sondern gerade die grossen: von 34 Bildern im Auftakt zur
 * Season 8 waren so 12 unerreichbar, darunter saemtliche Kunst der
 * Game-Aids-Seiten. Fuer die Sammelfassung dieser Ausnahme galten sie faelsch-
 * licherweise als Seitenschmuck.
 */
async function resolveObject(store: ObjectStore, name: string): Promise<RawImage | undefined> {
  return new Promise((done) => {
    let settled = false;
    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done((value as RawImage | null) ?? undefined);
    };
    const timer = setTimeout(() => finish(undefined), RESOLVE_TIMEOUT);
    try {
      store.get(name, finish);
    } catch {
      finish(undefined);
    }
  });
}

type Matrix = readonly number[];

const UNIT: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

/**
 * Wohin die Matrix das Einheitsquadrat legt.
 *
 * Ein Bild wird in PDF immer in das Quadrat von (0,0) bis (1,1) gezeichnet und
 * durch die Matrix an seinen Platz gebracht. Die Matrix spiegelt dabei fast
 * immer die y-Achse — deshalb ueber alle vier Ecken rechnen und nicht ueber
 * Verschiebung plus Groesse.
 */
export function placementOf(m: Matrix): Placement {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    xs.push(m[0]! * u + m[2]! * v + m[4]!);
    ys.push(m[1]! * u + m[3]! * v + m[5]!);
  }
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

/**
 * Liest die Bilder eines PDFs, Seite fuer Seite.
 *
 * Als Generator, damit die Pixel nicht alle zugleich im Speicher liegen — eine
 * einzelne Karte bringt schon vier Megabyte roh mit. Der Aufrufer kodiert
 * jedes Bild, sobald es kommt, und laesst die Rohdaten dann fallen.
 *
 * Uebergangen werden Objekte, die pdfjs nicht auf der Seite fuehrt (`g_d0_...`):
 * das sind die seitenuebergreifend zwischengespeicherten, also genau der
 * Seitenschmuck, der auf jeder Seite wiederkehrt.
 */
export async function* readImages(
  data: Uint8Array,
  options: ImageOptions,
): AsyncGenerator<ExtractedImage> {
  const minPixels = options.minPixels ?? MIN_PIXELS;
  const minColours = options.minColours ?? MIN_COLOURS;
  /** Was schon herauskam, an den rohen Punkten erkannt. */
  const seenContent = new Set<string>();

  // Die Kopie aus demselben Grund wie in `extract.ts`: pdf.js reicht den
  // Puffer an seinen Worker weiter und loest ihn dabei ab.
  const document = await pdfjs.getDocument({
    data: data.slice(),
    ...options.dokumentParameter,
  }).promise;

  const operations = pdfjs.OPS as unknown as Record<string, number>;
  const nameOf = new Map(Object.entries(operations).map(([name, code]) => [code, name]));

  const lastPage = Math.min(options.toPage ?? document.numPages, document.numPages);

  for (let pageNumber = options.fromPage; pageNumber <= lastPage; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const list = await page.getOperatorList();
    const seen = new Set<string>();
    // Nur echter Text zaehlt; Kartenbeschriftungen stehen **auf** der Karte.
    const onPage = (options.blocks ?? []).filter(
      (block) => block.page === pageNumber && block.role !== 'map-label',
    );
    const labels = (options.blocks ?? []).filter(
      (block) => block.page === pageNumber && block.role === 'map-label',
    );
    let matrix: Matrix = UNIT;
    const stack: Matrix[] = [];

    for (let i = 0; i < list.fnArray.length; i++) {
      const operation = nameOf.get(list.fnArray[i]!) ?? '';
      const args = list.argsArray[i] as unknown[];

      // Den Zeichenzustand mitfuehren, sonst weiss niemand, wo das Bild sitzt.
      if (operation === 'save') stack.push(matrix);
      else if (operation === 'restore') matrix = stack.pop() ?? matrix;
      else if (operation === 'transform') matrix = multiply(matrix, args as number[]);
      else if (operation === 'paintFormXObjectBegin') {
        stack.push(matrix);
        matrix = multiply(matrix, args[0] as number[]);
      } else if (operation === 'paintFormXObjectEnd') matrix = stack.pop() ?? matrix;

      if (!PAINT_IMAGE.test(operation)) continue;
      const name = String(args[0]);
      // Dasselbe Bild wird oft mehrfach gezeichnet — gekachelt oder gespiegelt.
      if (seen.has(name)) continue;
      seen.add(name);

      // Objekte mit `g_` davor liegen im gemeinsamen Speicher des Dokuments,
      // alle anderen bei der Seite.
      const store = name.startsWith('g_') ? page.commonObjs : page.objs;
      const image = await resolveObject(store, name);
      if (!image?.data || CHANNELS[image.kind] === undefined) continue;
      if (image.width * image.height < minPixels) continue;
      const aspect = Math.max(image.width / image.height, image.height / image.width);
      if (aspect > (options.maxAspect ?? MAX_ASPECT)) continue;

      // Was zu wenige Farben kennt, ist Verlauf oder Muster, nicht Inhalt.
      if (colourShare(image.width, image.height, image.kind, image.data) < minColours) continue;

      const at = placementOf(matrix);
      // Steht Text auf der Farbe, ist es der Grund eines Kastens.
      if (isBackdrop(image, at, onPage)) continue;

      // Dasselbe Bild wird oft mehrfach eingebettet. Verglichen werden die
      // **rohen** Punkte, nicht die fertige Datei: so faellt die Dublette auf,
      // bevor sie kodiert wird.
      //
      // Verglichen wird nur auf Gleichheit. Dieselbe Kunst in anderem
      // Zuschnitt — im Text gross, im Anhang als Handout kleiner — bleibt
      // damit doppelt stehen. Ein aehnlichkeitsbasierter Abgleich (aHash wie
      // dHash) wurde geprueft und verworfen: bei freigestellten Figuren auf
      // durchsichtigem Grund ueberlappen die Abstaende echter Dubletten
      // (7 bis 10 Bit) mit denen verschiedener Bilder (8 bis 11).
      const mark = sha256Hex(image.data);
      if (seenContent.has(mark)) continue;
      seenContent.add(mark);

      yield {
        page: pageNumber,
        at,
        name,
        width: image.width,
        height: image.height,
        kind: image.kind,
        role: traegtKartenbeschriftung(image, at, labels) ? 'karte' : imageRole(image.kind),
        data: image.data,
      };
    }

    page.cleanup();
    options.fortschritt?.(pageNumber, lastPage);
  }

  await document.destroy();
}
