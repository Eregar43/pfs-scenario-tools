/**
 * Gibt den Bildern ihren Namen und ihre Sorte.
 *
 * Ein Dateiname wie `s06.png` sagt nichts. Der Name steht aber im PDF, gleich
 * neben dem Bild — mal als Bildunterschrift (`Ingrit and Tagheema`), mal als
 * Ueberschrift des Abschnitts, zu dem das Bild gehoert (`A. Karrenholt`,
 * `Locust Dagger`). Welcher es ist, entscheidet die **Lage**: der naechste
 * benennende Block gewinnt.
 *
 * Portiert aus dem Extractor; `slugify` ist mitgezogen, weil es dort in der
 * Ausgabeschicht wohnt, die es hier nicht gibt.
 */
import type { ExtractedImage, Placement } from './images.ts';
import type { Block } from './types.ts';

/** Die drei Sorten, nach denen die Bilder abgelegt werden. */
export type ImageSort = 'karte' | 'person' | 'gegenstand';

export const FOLDER: Record<ImageSort, string> = {
  karte: 'karten',
  person: 'personen',
  gegenstand: 'gegenstaende',
};

/** Namen zu Dateinamen, zeichengleich mit dem Extractor. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Bloecke, die ein Bild benennen koennen.
 *
 * `caption` ist der beste Fall — Paizo setzt sie eigens fuer das Bild daneben.
 * Sie fehlt aber in aelteren Jahrgaengen ganz; dort traegt die Ueberschrift des
 * Abschnitts den Namen (`Danbry`, `Teritha`, `Locust Dagger`).
 */
const NAMES: ReadonlySet<Block['role']> = new Set(['caption', 'heading', 'subheading']);

/**
 * Rollen fuer die **Rueckfallsuche** einer Figur ohne Unterschrift.
 *
 * Kastentitel kommen dazu: Die Inselkarte im Auftakt zu 8-01 gehoert zum
 * Kasten `WHERE ON GOLARION?` — jede Ueberschrift der Seite liegt weiter weg
 * und benennt anderes. In der normalen Suche bleiben Kastentitel aussen vor;
 * sie sind zu oft Spielhilfen (`ADJUSTING DIFFICULTY`), keine Namen.
 */
const FALLBACK_NAMES: ReadonlySet<Block['role']> = new Set([...NAMES, 'box-heading']);

/**
 * Die Bildunterschrift gewinnt, wenn sie ueberhaupt in Reichweite ist — auch
 * gegen eine naeher stehende Ueberschrift. Sie ist eigens fuer das Bild
 * gesetzt, die Ueberschrift nur zufaellig daneben.
 */
const CAPTION_REACH = 320;

/**
 * Wortlaute, die kein Name sind. Sie stehen als Ueberschrift im Satz, meinen
 * aber die Stufenfassung einer Begegnung oder die Fortsetzung des Titels.
 *
 * `Appendix` ist gegenueber dem Extractor dazugekommen: `Appendix: Game Aids`
 * steht unmittelbar ueber den Spielhilfen-Bildern und gewann sonst gegen den
 * Namen, der **unter** dem Bild steht.
 */
const NOT_A_NAME = /^(Levels?\s+\d|By\s|Pathfinder Society|Scenario\b|Appendix\b|\d+$)/i;

/** Ortskennung vor einer Begegnung: `A. Karrenholt` meint `Karrenholt`. */
const AREA_PREFIX = /^[A-Z]\d?\.\s+/;

/**
 * Die Kennung eines **Ortes** — ohne Ziffer.
 *
 * Paizo nummeriert den Schauplatz mit `A.` und seine Raeume darin mit `A1.`,
 * `A2.` und so fort. Eine Karte zeigt den Schauplatz, nicht den einzelnen Raum:
 * in `For the Love of Vanity` stehen auf derselben Seite
 * `A. The Solstice Theater`, `A1. Foyer` und `A2. Balconies` — die Karte heisst
 * nach dem Theater.
 */
const AREA_SITE = /^[A-Z]\.\s+/;

/**
 * Schwierigkeitsgrad am Ende einer Begegnungsueberschrift, mitsamt der Stufe
 * dahinter: `The Sinister Stevedores Low 1` heisst als Datei
 * `the-sinister-stevedores`.
 */
const DIFFICULTY = /\s+(Trivial|Low|Moderate|Severe|Extreme)(\s+\d+)?$/;

/**
 * Woran eine **Begegnung** zu erkennen ist: an ihrer Ortskennung oder an ihrem
 * Schwierigkeitsgrad. Nur sie kommt als Name einer ganzseitigen Karte in
 * Frage — die naechststehende Ueberschrift waere sonst die des Textes, der
 * gerade endet. In `A Theft in Harborgate` steht vor der Schiffskarte auf
 * Seite 9 bereits `Conclusion`, gemeint ist aber `Boarding Action Moderate 1`.
 */
const ENCOUNTER = new RegExp(`${AREA_PREFIX.source}|${DIFFICULTY.source}`);

/** Abstand eines Blocks zum Bildrechteck; 0, wenn er darin liegt. */
export function distanceTo(at: Placement, x: number, y: number): number {
  const dx = x < at.left ? at.left - x : x > at.right ? x - at.right : 0;
  const dy = y < at.bottom ? at.bottom - y : y > at.top ? y - at.top : 0;
  return Math.hypot(dx, dy);
}

function cleanName(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(AREA_PREFIX, '')
    .replace(DIFFICULTY, '')
    .trim();
}

/** Ein Namenskandidat: ein Wortlaut an einer Stelle der Seite. */
interface NameCandidate {
  text: string;
  x: number;
  y: number;
}

/**
 * Ab dieser Luecke innerhalb einer Zeile sind es zwei Namen, kein Wortabstand.
 *
 * Die Spielhilfen-Seiten setzen mehrere Namen in **einen** Block: `Ella` und
 * `Poppet Mage` stehen auf derselben Grundlinie 237 Punkte auseinander (die
 * Spaltenerkennung sieht auf einer Bilderseite nur eine Spalte). Wortabstaende
 * messen dagegen wenige Punkte.
 */
const SPLIT_GAP = 40;

/**
 * Wann zwei **Zeilen** desselben Blocks zwei Namen sind, entscheidet die
 * Schriftgroesse: `Zarta Dralneen` und `Rain in Cloudy Day` stehen bei rund
 * zehn Punkt Schrift 36 Punkte auseinander — gut drei Zeilenhoehen. Ein
 * umbrochener Name haette etwa eine. Eine feste Schwelle traegt hier nicht:
 * 36 Punkte waeren bei einer grossen Ueberschrift ein gewoehnlicher Umbruch.
 */
const LINE_SPLIT_FACTOR = 1.8;
const LINE_SPLIT_MIN = 24;

function lineSplitLimit(previous: { runs: { size?: number }[] }): number {
  return Math.max(LINE_SPLIT_MIN, LINE_SPLIT_FACTOR * (previous.runs[0]?.size ?? 12));
}

/**
 * Zerlegt einen benennenden Block in seine Namenskandidaten.
 *
 * Getrennt wird an grossen Luecken — zwischen Zeilen wie innerhalb einer
 * Zeile. Was keine grosse Luecke hat, bleibt **ein** Kandidat mit dem ganzen
 * Wortlaut; fuer gewoehnliche Ueberschriften aendert sich dadurch nichts.
 *
 * Bloecke ohne Laufdaten (in Tests von Hand gebaut) fallen auf den Blocktext
 * zurueck.
 */
function nameCandidatesOf(block: Block): NameCandidate[] {
  const first = block.lines[0];
  if (!first) return [];
  if (block.lines.every((line) => line.runs.length === 0)) {
    return [{ text: block.text, x: first.x, y: first.y }];
  }

  // Zeilen zu Gruppen, getrennt an grossen vertikalen Luecken.
  const groups: (typeof block.lines)[] = [];
  let group: typeof block.lines = [];
  for (const line of block.lines) {
    const previous = group[group.length - 1];
    // Betrag, nicht Differenz: die Zeilen eines zusammengesetzten Blocks
    // stehen nicht zwingend in Leserichtung untereinander.
    if (previous && Math.abs(previous.y - line.y) > lineSplitLimit(previous)) {
      groups.push(group);
      group = [];
    }
    group.push(line);
  }
  if (group.length > 0) groups.push(group);

  const candidates: NameCandidate[] = [];
  for (const lines of groups) {
    const line = lines[0]!;
    if (lines.length === 1) {
      // Laeufe an grossen horizontalen Luecken trennen.
      const segments: (typeof line.runs)[] = [];
      let segment: typeof line.runs = [];
      for (const run of line.runs) {
        const previous = segment[segment.length - 1];
        if (previous && run.x - (previous.x + previous.width) > SPLIT_GAP) {
          segments.push(segment);
          segment = [];
        }
        segment.push(run);
      }
      if (segment.length > 0) segments.push(segment);

      if (segments.length > 1) {
        for (const runs of segments) {
          candidates.push({
            text: runs.map((run) => run.text).join(''),
            x: runs[0]!.x,
            y: line.y,
          });
        }
        continue;
      }
    }

    candidates.push({
      text: lines.map((l) => l.runs.map((run) => run.text).join('')).join(' '),
      x: line.x,
      y: line.y,
    });
  }

  return candidates;
}

/**
 * Der Name eines Bildes: der naechststehende benennende Wortlaut auf
 * derselben Seite.
 *
 * Ohne Treffer bleibt das Bild namenlos — geraten wird nicht. Ein falscher
 * Name waere schlimmer als gar keiner: er landet im Dateinamen und wird
 * geglaubt.
 *
 * `roles` erweitert die Suche fuer die Rueckfallfaelle; Schauplatz- und
 * Begegnungslogik bleiben davon unberuehrt und rechnen immer nur mit den
 * Kernrollen.
 */
export function nameFor(
  image: ExtractedImage,
  blocks: Block[],
  roles: ReadonlySet<Block['role']> = NAMES,
): string | undefined {
  return findeName(image, blocks, roles)?.name;
}

/** Ein gefundener Name; `kasten` traegt den Kastentitel, falls er ihn gab. */
interface Namensfund {
  name: string;
  /**
   * Wortlaut des Kastentitels, wenn der Name aus einem Kasten stammt — die
   * Einbettung setzt das Bild dann **in diesen Kasten**, statt es nur
   * abzulegen (die Inselkarte gehoert in `WHERE ON GOLARION?`).
   */
  kasten?: string;
}

function findeName(
  image: ExtractedImage,
  blocks: Block[],
  roles: ReadonlySet<Block['role']>,
): Namensfund | undefined {
  let best: { name: string; distance: number; caption: boolean; kasten?: string } | undefined;
  /** Der zuletzt aufgeschlagene Schauplatz — er benennt die Karten. */
  let site: string | undefined;
  /** Die zuletzt aufgeschlagene Begegnung, falls es keinen Schauplatz gibt. */
  let encounter: string | undefined;
  /** Ersatz, falls gar keine Begegnung davor stand. */
  let before: string | undefined;

  for (const block of blocks) {
    if (!roles.has(block.role)) continue;
    const heading = block.text.replace(/\s+/g, ' ').trim();
    const name = cleanName(block.text);
    if (name === '' || NOT_A_NAME.test(name)) continue;

    if (block.page < image.page) {
      if (block.role === 'caption' || !NAMES.has(block.role)) continue;
      before = name;
      if (AREA_SITE.test(heading)) site = name;
      else if (ENCOUNTER.test(heading)) encounter = name;
      continue;
    }
    if (block.page > image.page) continue;

    // Auf der Seite selbst zaehlt eine Begegnung nur, wenn sie **ueber** dem
    // Bild steht; darunter gehoert sie schon zum naechsten Abschnitt.
    if (block.role !== 'caption' && NAMES.has(block.role) && ENCOUNTER.test(heading)) {
      const line = block.lines[0];
      if (line && line.y >= image.at.top) {
        if (AREA_SITE.test(heading)) site = name;
        else encounter = name;
      }
    }

    // Ein Block kann mehrere Namen tragen — die Spielhilfen-Seiten setzen
    // sie nebeneinander und uebereinander in denselben Block. Jeder
    // Kandidat zaehlt einzeln, mit eigenem Wortlaut und eigener Stelle.
    for (const candidate of nameCandidatesOf(block)) {
      const candidateName = cleanName(candidate.text);
      if (candidateName === '' || NOT_A_NAME.test(candidateName)) continue;
      const distance = distanceTo(image.at, candidate.x, candidate.y);
      const caption = block.role === 'caption';
      const kasten = block.role === 'box-heading' ? heading : undefined;

      // Eine Bildunterschrift in Reichweite schlaegt jede Ueberschrift.
      if (best?.caption && !caption) continue;
      if (caption && !best?.caption && distance <= CAPTION_REACH) {
        best = { name: candidateName, distance, caption };
        continue;
      }
      if (!best || distance < best.distance) {
        // Ein Kastentitel zaehlt als Quelle nur in Reichweite — sonst wuerde
        // auf einer kargen Seite ein ferner Kasten ein Bild vereinnahmen.
        best = {
          name: candidateName,
          distance,
          caption,
          ...(kasten && distance <= CAPTION_REACH ? { kasten } : {}),
        };
      }
    }
  }

  // Eine **Karte** gehoert zu ihrer Begegnung, nicht zu der Zwischen-
  // ueberschrift, die zufaellig am naechsten steht. In `For the Love of
  // Vanity` stand neben der Karte `Balconies` — gemeint ist
  // `A. The Solstice Theater`.
  if (image.role === 'karte') {
    const name = site ?? encounter ?? best?.name ?? before;
    if (name === undefined) return undefined;
    return name === best?.name && best.kasten ? { name, kasten: best.kasten } : { name };
  }

  // Eine freigestellte Figur traegt dagegen den Namen, der bei ihr steht.
  const name = best?.name ?? encounter ?? before;
  if (name === undefined) return undefined;
  return name === best?.name && best.kasten ? { name, kasten: best.kasten } : { name };
}

/**
 * Ordnet jeder Bildunterschrift ihr Bild zu — **eins zu eins**.
 *
 * Der Blick geht von der Unterschrift aus, nicht vom Bild: Auf einer Seite
 * mit Portraet und Karte liegt die Unterschrift oft in Reichweite beider,
 * und vom Bild aus gesehen gewinnt dann das falsche. So stand die Inselkarte
 * von 8-01 im Journal unter „Zarta Dralneen", waehrend das Portraet leer
 * ausging. Zugeordnet wird deshalb ueber alle Paare nach Abstand: die
 * naechste Paarung zuerst, jede Unterschrift und jedes Bild nur einmal.
 *
 * **Karten konkurrieren nicht.** Eine Unterschrift benennt die freigestellte
 * Figur daneben; eine Karte hat ihre Begegnung.
 *
 * Zurueck kommt der Wortlaut des Unterschrift-Blocks **unbereinigt** — er
 * muss zeichengleich mit dem sein, was `blockHtml` als
 * `<!-- Bildunterschrift: ... -->` ins Journal geschrieben hat, sonst findet
 * die Einbettung ihren Platz nicht.
 */
export function paareBildunterschriften(
  images: ExtractedImage[],
  blocks: Block[],
): Map<ExtractedImage, string> {
  const paare: { image: ExtractedImage; block: Block; distance: number }[] = [];

  for (const block of blocks) {
    if (block.role !== 'caption') continue;
    const line = block.lines[0];
    if (!line) continue;

    for (const image of images) {
      if (image.role === 'karte' || image.page !== block.page) continue;
      const distance = distanceTo(image.at, line.x, line.y);
      if (distance <= CAPTION_REACH) paare.push({ image, block, distance });
    }
  }

  paare.sort((a, b) => a.distance - b.distance);

  const zugeordnet = new Map<ExtractedImage, string>();
  const vergeben = new Set<Block>();
  for (const paar of paare) {
    if (zugeordnet.has(paar.image) || vergeben.has(paar.block)) continue;
    zugeordnet.set(paar.image, paar.block.text);
    vergeben.add(paar.block);
  }

  return zugeordnet;
}

/**
 * Ob ein Name einen Gegenstand meint.
 *
 * Person und Gegenstand sehen im PDF gleich aus — beide freigestellt, beide
 * mit Namen daneben, im Kunstverzeichnis sogar in derselben Zeile
 * (`Watcher-Lord Ulthun II Locust Dagger`). Was sie trennt, ist der **Text**:
 * ein Gegenstand steht in der Ausruestung einer Kreatur oder in der Beute, eine
 * Person nie. `Locust Dagger` findet sich als `**Items** locust dagger`.
 *
 * Trifft nichts zu, gilt das Bild als Person. Das ist der haeufigere Fall —
 * die freigestellte Kunst dieser Hefte zeigt fast durchweg Figuren.
 */
const CARRIED = /\*\*(Items|Treasure)\*\*[^*]*/gi;

export function isObject(name: string, text: string): boolean {
  const needle = name.toLowerCase();
  for (const match of text.matchAll(CARRIED)) {
    if (match[0].toLowerCase().includes(needle)) return true;
  }
  return false;
}

export interface NamedImage {
  image: ExtractedImage;
  sort: ImageSort;
  /** Dateiname ohne Endung — der Name, sonst die Seite. */
  file: string;
  /** Der Anzeigename, aus dem der Dateiname entstand; fehlt bei Namenlosen. */
  name?: string;
  /** Kastentitel, wenn der Name aus einem Kasten stammt — siehe `Namensfund`. */
  kastenTitel?: string;
}

/**
 * Benennt alle Bilder eines Szenarios und vergibt die Dateinamen.
 *
 * Die Reihenfolge der Quellen: eine **gepaarte Bildunterschrift** benennt ihr
 * Bild exklusiv (dieselbe Eins-zu-eins-Zuordnung wie bei der Einbettung —
 * sonst nimmt sich die Inselkarte den Namen des Portraets daneben). Figuren
 * ohne Unterschrift suchen in Ueberschriften **und Kastentiteln**, aber nicht
 * mehr in fremden Unterschriften. Karten behalten ihre Schauplatzlogik.
 *
 * Gleiche Namen werden durchgezaehlt statt ueberschrieben; namenlose Bilder
 * behalten ihre Seitenzahl.
 */
/**
 * Groesste Flaeche eines Karten-**Einschubs**, in Bildpunkten.
 *
 * Die Uebersichtskarte im `WHERE ON GOLARION?`-Kasten misst um 0,2 Megapixel,
 * die kleinste echte Schlachtkarte der dreizehn Hefte 1,22 — dazwischen ist
 * viel Luft. Nur unterhalb dieser Schwelle darf ein Kastentitel eine Karte
 * vereinnahmen; eine Schlachtkarte neben einer Sidebar bleibt eine Szene.
 */
const EINSCHUB_MAX_PIXELS = 1_000_000;

export function nameImages(
  images: ExtractedImage[],
  blocks: Block[],
  text: string,
): NamedImage[] {
  const unterschriften = paareBildunterschriften(images, blocks);
  const ohneUnterschriften = blocks.filter((block) => block.role !== 'caption');

  const used = new Map<string, number>();
  const named: NamedImage[] = [];

  for (const image of images) {
    const gepaart = unterschriften.get(image);
    let fund: Namensfund | undefined;

    if (image.role === 'karte') {
      // Eine kleine Karte mit Kastentitel in Reichweite ist ein **Einschub**
      // (die Golarion-Uebersicht) — sie heisst nach ihrem Kasten und wird
      // dort eingebettet statt eine Szene zu werden. In 8-02 ist dieselbe
      // Uebersicht ohne Alphakanal gesetzt und lief sonst als Schlachtkarte.
      const einschub =
        image.width * image.height < EINSCHUB_MAX_PIXELS
          ? findeName(image, ohneUnterschriften, FALLBACK_NAMES)
          : undefined;
      fund = einschub?.kasten ? einschub : findeName(image, blocks, NAMES);
    } else {
      fund =
        gepaart !== undefined
          ? { name: cleanName(gepaart) }
          : findeName(image, ohneUnterschriften, FALLBACK_NAMES);
    }

    const name = fund?.name;
    const sort: ImageSort =
      image.role === 'karte' ? 'karte' : name && isObject(name, text) ? 'gegenstand' : 'person';

    const base = name ? slugify(name) : `s${String(image.page).padStart(2, '0')}`;
    // Ein gemeinsamer Zaehler ueber alle Sorten: die Bilder liegen in einem
    // Verzeichnis, gleiche Namen duerfen sich auch quer zur Sorte nicht
    // ueberschreiben.
    const nth = (used.get(base) ?? 0) + 1;
    used.set(base, nth);

    named.push({
      image,
      sort,
      file: nth > 1 ? `${base}-${nth}` : base,
      ...(name !== undefined ? { name } : {}),
      ...(fund?.kasten !== undefined ? { kastenTitel: fund.kasten } : {}),
    });
  }

  return named;
}
