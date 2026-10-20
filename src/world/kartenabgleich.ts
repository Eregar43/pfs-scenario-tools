import type { Kartendaten } from './karten.ts';
import { markeAusPfad, markePfad } from './raummarken.ts';
import { wandSignaturen } from './waende.ts';

/**
 * Szene gegen Kartendatei — reine Logik, kein Foundry-Zugriff.
 *
 * Plan und Import stellen dieselbe Frage („weicht die Szene von der Datei
 * ab?"), der Plan am Abbild der Welt, der Import am lebenden Dokument. Beide
 * rufen deshalb **diese** Funktionen; zwei Fassungen derselben Pruefung
 * fuehrten dazu, dass die Vorschau „unveraendert" sagt, waehrend der Import
 * schreibt (so geschehen bei den Waenden, siehe CLAUDE.md).
 *
 * Verglichen wird immer nur, **was die Datei nennt**. Eine Szene traegt
 * Dutzende Felder mehr, und eine neuere Foundry-Fassung bringt neue mit; die
 * zaehlen nicht als Abweichung, sonst wuerde jede Szene bei jedem Lauf neu
 * geschrieben.
 */

/** Die Journal-Arten, auf die eine Notiz zeigen darf. */
export type JournalArt = 'journal' | 'anhangJournal' | 'handoutJournal';

/** Kennung je Journal-Art, so wie sie in dieser Welt vergeben ist. */
export type Journalkennungen = Partial<Record<JournalArt, string>>;

/** Was eine Szene zum Vergleich hergibt — die Quelldaten aus `toObject()`. */
export interface SzenenStand {
  szene: Record<string, unknown>;
  ebene?: Record<string, unknown>;
  waende: Record<string, unknown>[];
  lichter: Record<string, unknown>[];
  regionen: Record<string, unknown>[];
  /** Schon in Dateiform (`journal` statt `entryId`), siehe `notizInDatei`. */
  notizen: Record<string, unknown>[];
  zeichnungen: Record<string, unknown>[];
}

/** Je Teil der Kartendatei: weicht die Szene davon ab? */
export interface Szenenabweichung {
  szene: boolean;
  ebene: boolean;
  waende: boolean;
  lichter: boolean;
  regionen: boolean;
  notizen: boolean;
  zeichnungen: boolean;
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Enthaelt `ist` alles, was `soll` nennt, mit denselben Werten?
 *
 * Objekte vergleichen nur die Schluessel von `soll`; Listen muessen gleich
 * lang sein und Stueck fuer Stueck passen. `null` und ein fehlender Wert
 * gelten als gleich — Foundry liefert ein leeres Feld je nach Fassung als
 * das eine oder das andere.
 */
export function enthaelt(ist: unknown, soll: unknown): boolean {
  if (istObjekt(soll)) {
    if (!istObjekt(ist)) return false;
    return Object.entries(soll).every(([schluessel, wert]) => enthaelt(ist[schluessel], wert));
  }
  if (Array.isArray(soll)) {
    if (!Array.isArray(ist) || ist.length !== soll.length) return false;
    return soll.every((wert, index) => enthaelt(ist[index], wert));
  }
  if (soll === null || soll === undefined) return ist === null || ist === undefined;
  return ist === soll;
}

/**
 * Passen zwei Sammlungen zueinander — jedes Soll-Stueck zu genau einem
 * Ist-Stueck, die Reihenfolge egal?
 *
 * Gierige Zuordnung reicht: Zwei Soll-Stuecke, die auf dasselbe Ist-Stueck
 * passen, waeren deckungsgleiche Doppel, und die laesst der Export nicht
 * durch.
 */
export function sammlungGleich(
  ist: readonly Record<string, unknown>[],
  soll: readonly Record<string, unknown>[],
): boolean {
  if (ist.length !== soll.length) return false;
  const frei = [...ist];
  for (const stueck of soll) {
    const index = frei.findIndex((kandidat) => enthaelt(kandidat, stueck));
    if (index < 0) return false;
    frei.splice(index, 1);
  }
  return true;
}

/**
 * Mischt `oben` tief in `unten` — `oben` gewinnt. Listen werden ersetzt,
 * nicht gemischt. Beide Eingaben bleiben unangetastet.
 */
export function tiefMischen(
  unten: Record<string, unknown>,
  oben: Record<string, unknown>,
): Record<string, unknown> {
  const ergebnis: Record<string, unknown> = { ...unten };
  for (const [schluessel, wert] of Object.entries(oben)) {
    const bisher = ergebnis[schluessel];
    ergebnis[schluessel] =
      istObjekt(bisher) && istObjekt(wert) ? tiefMischen(bisher, wert) : wert;
  }
  return ergebnis;
}

/**
 * Felder, die keine Datei fuehrt: Kennung, Fremd-Flags, Zeitstempel — und
 * die Rechte. Regionen tragen `ownership` mit den Benutzerkennungen der Welt
 * des Autors; die gibt es anderswo nicht.
 */
const OHNE = ['_id', 'flags', '_stats', 'ownership'] as const;

/** Ein eingebettetes Dokument ohne die Felder aus `OHNE`. */
export function ohneWeltfelder(
  daten: Record<string, unknown>,
  behalten: readonly string[] = [],
): Record<string, unknown> {
  const ergebnis: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(daten)) {
    if ((OHNE as readonly string[]).includes(schluessel) && !behalten.includes(schluessel)) continue;
    ergebnis[schluessel] = wert;
  }
  return ergebnis;
}

/**
 * Eine Notiz der Welt in Dateiform: `journal` (die Art) statt `entryId`.
 *
 * Die Seitenkennung bleibt — sie entsteht im Import aus dem Seitennamen und
 * ist in jeder Welt dieselbe. Die Kennung des Journals dagegen nicht. Zeigt
 * die Notiz auf ein Journal, das nicht vom Modul stammt, verliert sie den
 * Verweis und behaelt nur ihren Text; `verweisEntfernt` sagt das an.
 *
 * Ein Raummarker des Moduls (`…/marker/A1.svg`) wird zu `marke: "A1"`. Der
 * Bildpfad haengt am Bildordner dieser Welt; die Kennung gilt in jeder.
 */
export function notizInDatei(
  notiz: Record<string, unknown>,
  artVon: (journalId: string) => JournalArt | undefined,
): { notiz: Record<string, unknown>; verweisEntfernt: boolean } {
  const { entryId, pageId, ...rest } = ohneWeltfelder(notiz);
  const art = typeof entryId === 'string' ? artVon(entryId) : undefined;
  const mitVerweis = art !== undefined;
  const textur = istObjekt(rest.texture) ? rest.texture : undefined;
  const marke = markeAusPfad(textur?.src);
  if (marke && textur) {
    const { src: _pfad, ...ohnePfad } = textur;
    rest.texture = ohnePfad;
  }
  return {
    notiz: {
      ...rest,
      ...(marke ? { marke } : {}),
      ...(mitVerweis ? { journal: art, pageId: pageId ?? null } : {}),
    },
    verweisEntfernt: typeof entryId === 'string' && entryId !== '' && !mitVerweis,
  };
}

/**
 * Die Umkehrung von `notizInDatei`, fuer das Anlegen in einer Welt.
 *
 * Aus `marke` wird der Pfad des Markerbilds neben der Karte dieser Welt.
 * Ohne Kartenpfad bleibt die Notiz ohne eigenes Bild.
 */
export function notizAusDatei(
  notiz: Record<string, unknown>,
  journale: Journalkennungen,
  kartenPfad?: string,
): Record<string, unknown> {
  const { journal, pageId, marke, ...rest } = notiz;
  if (typeof marke === 'string' && kartenPfad) {
    rest.texture = {
      ...(istObjekt(rest.texture) ? rest.texture : {}),
      src: markePfad(kartenPfad, marke),
    };
  }
  const ziel = typeof journal === 'string' ? journale[journal as JournalArt] : undefined;
  return ziel ? { ...rest, entryId: ziel, pageId: pageId ?? null } : { ...rest, entryId: null, pageId: null };
}

/** Liest eine eingebettete Liste aus `toObject()`; fehlt sie, ist sie leer. */
function liste(wert: unknown): Record<string, unknown>[] {
  return Array.isArray(wert) ? wert.filter(istObjekt) : [];
}

/**
 * Der Vergleichsstand einer Szene, aus ihren Quelldaten (`toObject()`).
 *
 * `artVon` ordnet einer Journal-Kennung ihre Art zu — nur Journale des
 * Moduls haben eine.
 */
export function szenenStand(
  daten: Record<string, unknown>,
  artVon: (journalId: string) => JournalArt | undefined,
): SzenenStand {
  const ebene = liste(daten.levels)[0];
  return {
    szene: daten,
    ...(ebene ? { ebene } : {}),
    waende: liste(daten.walls),
    lichter: liste(daten.lights),
    regionen: liste(daten.regions),
    notizen: liste(daten.notes).map((notiz) => notizInDatei(notiz, artVon).notiz),
    zeichnungen: liste(daten.drawings),
  };
}

/**
 * Wo weicht die Szene von ihrer Kartendatei ab?
 *
 * Fehlt ein Teil in der Datei, weicht er nie ab: Dann gehoert er dem
 * Spielleiter, und der Import faesst ihn nicht an.
 */
export function szenenAbweichung(stand: SzenenStand, karte: Kartendaten): Szenenabweichung {
  return {
    szene: karte.szene !== undefined && !enthaelt(stand.szene, karte.szene),
    ebene: karte.ebene !== undefined && !enthaelt(stand.ebene ?? {}, karte.ebene),
    // Waende behalten ihre eigene Signatur: Sie ist seit dem ersten Export
    // geeicht, und `threshold`/`animation` vergleicht sie bewusst nicht.
    waende:
      karte.waende !== undefined && wandSignaturen(stand.waende) !== wandSignaturen(karte.waende),
    lichter: karte.lichter !== undefined && !sammlungGleich(stand.lichter, karte.lichter),
    regionen: karte.regionen !== undefined && !sammlungGleich(stand.regionen, karte.regionen),
    notizen: karte.notizen !== undefined && !sammlungGleich(stand.notizen, karte.notizen),
    zeichnungen:
      karte.zeichnungen !== undefined && !sammlungGleich(stand.zeichnungen, karte.zeichnungen),
  };
}

/** Weicht irgendein Teil ab? */
export function weichtAb(abweichung: Szenenabweichung): boolean {
  return Object.values(abweichung).some(Boolean);
}
