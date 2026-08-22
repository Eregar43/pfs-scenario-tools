import { extractScenario } from './pdf/extract.ts';
import { readImages, type ExtractedImage } from './pdf/images.ts';
import { nameImages, paareBildunterschriften, type ImageSort } from './pdf/imagenames.ts';
import { detectSections } from './pdf/journal.ts';
import { neueUnresolvedFonts, type UnresolvedFonts } from './pdf/runs.ts';
import { sha256Hex } from './pdf/sha256.ts';
import type { Scenario } from './pdf/scenario.ts';
import { dokumentParameter, richteEin, type PdfjsParameter } from './pdfjs/setup.ts';
import { kodiereBild } from './world/webp.ts';

/**
 * Die Bruecke zwischen Foundry und der reinen PDF-Schicht.
 *
 * Hier — und nur hier — treffen sich beide: `src/pdf/` weiss nichts von
 * Foundry, `src/pdfjs/setup.ts` braucht `foundry.utils.getRoute` fuer die
 * Pfade. Diese Datei reicht das eine an das andere weiter.
 */

export interface Leseergebnis {
  szenario: Scenario;
  /** Schriftverweise, die sich nicht aufloesen liessen — siehe unten. */
  unresolved: UnresolvedFonts;
  /** Kurzform des Streuwerts der PDF-Bytes; landet als Flag am Journal. */
  quellStreuwert: string;
  /**
   * Die PDF-Bytes selbst, fuer den Bilderlauf beim Schreiben in die Welt.
   * Sie sind nach dem Textlauf noch brauchbar, weil `extractScenario` pdf.js
   * eine Kopie uebergibt — der Worker loest nur die Kopie ab.
   */
  bytes: Uint8Array;
}

export interface LeseOptionen {
  fortschritt?: (seite: number, von: number) => void;
  variante?: PdfjsParameter;
}

/**
 * Liest ein Szenario aus einer im Browser gewaehlten Datei.
 *
 * Die Datei wird **nicht** hochgeladen. Sie kommt aus dem Dateiauswahlfeld des
 * Dialogs und wird im Arbeitsspeicher gelesen; Foundrys Datenbaum sieht sie
 * nie. Das ist Absicht: die Paizo-PDFs sind personalisiert und tragen den
 * Namen des Kaeufers im Wasserzeichen — im Datenbaum faende sie jeder Spieler
 * mit Zugriff auf den Dateibrowser.
 */
export async function szenarioAusDatei(
  file: File,
  optionen: LeseOptionen = {},
): Promise<Leseergebnis> {
  richteEin();

  const data = new Uint8Array(await file.arrayBuffer());
  const unresolved = neueUnresolvedFonts();
  const fallbackTitle = file.name.replace(/\.pdf$/i, '');

  // Der Streuwert **vor** dem Lesen. pdf.js reicht den Puffer an seinen Worker
  // weiter und loest ihn dabei ab (`transfer`); danach ist `data` leer, und
  // jeder Zugriff wirft "detached ArrayBuffer". In Node faellt das nicht auf,
  // weil dort kein echter Worker laeuft.
  const streuwert = quellStreuwert(data);

  const szenario = await extractScenario(data, fallbackTitle, {
    dokumentParameter: dokumentParameter(optionen.variante),
    quelle: file.name,
    ...(optionen.fortschritt ? { fortschritt: optionen.fortschritt } : {}),
    unresolved,
  });

  return { szenario, unresolved, quellStreuwert: streuwert, bytes: data };
}

/** Ein Bild aus dem PDF, fertig benannt und kodiert, bereit zum Hochladen. */
export interface GelesenesBild {
  sort: ImageSort;
  /** Dateiname ohne Endung. */
  file: string;
  /** `webp`, oder `png`, wenn der Browser kein WebP schreiben kann. */
  endung: string;
  blob: Blob;
  /** Bildunterschrift im Wortlaut, falls eine beim Bild steht. */
  caption?: string;
  /** Der Anzeigename — fuer die Bildseiten des Spielhilfen-Journals. */
  name?: string;
  /** Kastentitel, wenn das Bild in diesen Kasten eingebettet werden soll. */
  kastenTitel?: string;
  /** Steht das Bild in einem Appendix-Abschnitt (Spielhilfen)? */
  anhang: boolean;
  seite: number;
  /** Masse in Bildpunkten — die Karten geben sie an ihre Szene weiter. */
  breite: number;
  hoehe: number;
}

export interface Bilderlauf {
  bilder: GelesenesBild[];
  /**
   * Name fuer das Spielhilfen-Journal, aus dem Verzeichniseintrag des
   * Appendix gewonnen (`Appendix: Game Aids` → `Game Aids`). Fehlt, wenn es
   * keinen Appendix mit Bildern gibt.
   */
  anhangTitel?: string;
}

/**
 * Der Bilderlauf: liest die Bilder aus den PDF-Bytes, benennt sie und kodiert
 * sie sofort.
 *
 * Ein zweiter Durchgang ueber dasselbe PDF, wie im Extractor. Kodiert wird
 * **im Takt des Generators**: die rohen Pixel einer einzelnen Karte wiegen
 * schon mehrere Megabyte, die fertigen WebP-Dateien zusammen ein Bruchteil
 * davon.
 *
 * Der Seitenbereich kommt aus dem Inhaltsverzeichnis, wie im Extractor: vom
 * Anfang des Abenteuers bis vor den letzten Abschnitt (die Meldeboegen).
 * Ohne Verzeichnis bleibt es beim ganzen Heft.
 */
export async function bilderAusBytes(
  bytes: Uint8Array,
  szenario: Scenario,
  optionen: LeseOptionen = {},
): Promise<Bilderlauf> {
  richteEin();

  const sections = detectSections(szenario.blocks);
  const fromPage = sections[0]?.from ?? 1;
  const toPage = sections.length > 1 ? sections[sections.length - 1]!.from - 1 : undefined;

  // Die Spielhilfen stehen in einem Appendix-Abschnitt; seine Bilder
  // bekommen im Journal je eine eigene Bildseite.
  const anhaenge = sections.filter((section) => /^Appendix/i.test(section.title));
  const imAnhang = (seite: number): boolean =>
    anhaenge.some((section) => seite >= section.from && seite <= section.to);

  const gefunden: ExtractedImage[] = [];
  const kodiert = new Map<ExtractedImage, { blob: Blob; endung: string }>();

  for await (const bild of readImages(bytes, {
    fromPage,
    ...(toPage !== undefined ? { toPage } : {}),
    blocks: szenario.blocks,
    // `isOffscreenCanvasSupported: false` ist hier tragend: im Browser
    // (Voreinstellung `!isNodeJS`, also an) liefert der Worker dekodierte
    // Bilder als ImageBitmap **ohne** `data` — der Bilderlauf saehe dann
    // still null Bilder. In Node ist der Schalter immer aus, deshalb hat
    // der Extractor davon nie etwas bemerkt. Der Textlauf bleibt bei der
    // bestaetigten Kombination in `dokumentParameter` unveraendert.
    dokumentParameter: {
      ...dokumentParameter(optionen.variante),
      isOffscreenCanvasSupported: false,
    },
    ...(optionen.fortschritt ? { fortschritt: optionen.fortschritt } : {}),
  })) {
    kodiert.set(bild, await kodiereBild(bild));
    // Die Rohdaten werden nicht mehr gebraucht; Benennung und Lage haengen
    // nur an den Metadaten. So haelt niemand alle Pixel zugleich.
    bild.data = new Uint8Array(0);
    gefunden.push(bild);
  }

  // `**Items**` und `**Treasure**` stehen schon im Blocktext — der Fliesstext
  // des Extractors wird fuer die Gegenstands-Erkennung nicht gebraucht.
  const text = szenario.blocks.map((block) => block.text).join('\n\n');

  const unterschriften = paareBildunterschriften(gefunden, szenario.blocks);

  const bilder = nameImages(gefunden, szenario.blocks, text).map((benannt) => {
    const datei = kodiert.get(benannt.image)!;
    const caption = unterschriften.get(benannt.image);
    return {
      sort: benannt.sort,
      file: benannt.file,
      endung: datei.endung,
      blob: datei.blob,
      ...(caption !== undefined ? { caption } : {}),
      ...(benannt.name !== undefined ? { name: benannt.name } : {}),
      ...(benannt.kastenTitel !== undefined ? { kastenTitel: benannt.kastenTitel } : {}),
      anhang: imAnhang(benannt.image.page),
      seite: benannt.image.page,
      breite: benannt.image.width,
      hoehe: benannt.image.height,
    };
  });

  // Der Journalname kommt vom Abschnitt, der die Bilder tatsaechlich
  // enthaelt — `Appendix: Statistics` steht davor und hat keine.
  const anhangMitBildern = anhaenge.find((section) =>
    bilder.some((bild) => bild.anhang && bild.seite >= section.from && bild.seite <= section.to),
  );
  const anhangTitel = anhangMitBildern?.title.replace(/^Appendix\s*\d*:?\s*/i, '').trim();

  return {
    bilder,
    ...(anhangTitel ? { anhangTitel } : {}),
  };
}

/**
 * Kurzform des Streuwerts der PDF-Bytes.
 *
 * Landet als Flag am Journal und beantwortet spaeter die Frage, ob ein
 * erneuter Import aus **derselben** Datei kommt oder aus einer anderen.
 */
function quellStreuwert(daten: Uint8Array): string {
  return sha256Hex(daten).slice(0, 16);
}

/**
 * Kurzfassung eines Leseergebnisses fuer die Konsole.
 *
 * Zwei Zahlen entscheiden darueber, ob dem Ergebnis zu trauen ist: die
 * unaufgeloesten Schriftverweise (muessen null sein) und die unbekannten
 * Schriften aus dem Profil. Beide bedeuten dasselbe — die Rollenerkennung hat
 * keinen Namen, an dem sie sich festhalten kann, und der Text landet ohne
 * Gliederung im Journal.
 */
export function fasseZusammen({ szenario, unresolved }: Leseergebnis): Record<string, unknown> {
  const rollen: Record<string, number> = {};
  for (const block of szenario.blocks) {
    rollen[block.role] = (rollen[block.role] ?? 0) + 1;
  }

  return {
    titel: szenario.title,
    kennung: szenario.designation
      ? `${szenario.designation.season}-${String(szenario.designation.scenario).padStart(2, '0')}`
      : '(keine gefunden)',
    seiten: szenario.pageCount,
    bloecke: szenario.blocks.length,
    rollen,
    schriften: szenario.profile.schriften.length,
    unbekannteSchriften: szenario.profile.schriften.filter((s) => !s.erkannt).map((s) => s.name),
    unaufgeloesteSchriftverweise: unresolved.anzahl,
  };
}
