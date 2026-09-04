/**
 * Was von einem importierten Szenario in der Welt steht — zusammengesucht
 * ueber die eigenen Flags, als reine Daten.
 *
 * Das ist die Grundlage fuer Uebersicht und Entfernen: beide sollen exakt
 * dasselbe sehen. Dokumente ohne unser Flag tauchen nie auf — was der
 * Spielleiter selbst gebaut hat, geht den Betrieb nichts an.
 */
import { lies, type Bestandszahlen } from './flags.ts';
import { passtZuSeason } from './naming.ts';
import type { OrdnerAbbild, Weltabbild } from './plan.ts';

export interface SzenarioBestand {
  /** Gepaddet, `08-01`. */
  schluessel: string;
  season?: number;
  journal?: { id: string; name: string; seiten: number };
  anhang?: { id: string; name: string; seiten: number };
  handouts?: { id: string; name: string; seiten: number };
  szenen: { id: string; name: string }[];
  aktoren: { id: string; name: string }[];
  effekte: { id: string; name: string }[];
  /** Die Szenario-Ordner aller Dokumentarten (Journal, Szene, Actor). */
  ordner: { id: string; name: string }[];
  /** Juengster Importzeitpunkt ueber alle Dokumente. */
  importedAt?: string;
  sourceHash?: string;
  /** Fassung des Moduls, die importiert hat. */
  toolVersion?: string;
  /** Was der Import hinterlassen hat; fehlt bei aelteren Fassungen. */
  soll?: Bestandszahlen;
}

/** Wie ein Bestandteil dasteht. */
export type Zustand =
  /** So viel da wie erwartet — oder mehr. */
  | 'vollstaendig'
  /** Weniger als erwartet, aber nicht nichts. */
  | 'unvollstaendig'
  /** Erwartet, aber gar nichts mehr da. */
  | 'fehlt'
  /** Keine Soll-Zahl bekannt — aelter importiert, oder nicht nachsehbar. */
  | 'unbekannt';

export type Teil =
  | 'journal'
  | 'anhang'
  | 'handouts'
  | 'szenen'
  | 'aktoren'
  | 'effekte'
  | 'bilder';

export interface Teilbefund {
  teil: Teil;
  ist: number;
  soll?: number;
  zustand: Zustand;
}

function bewerte(ist: number, soll: number | undefined): Zustand {
  if (soll === undefined) return 'unbekannt';
  if (ist >= soll) return 'vollstaendig';
  return ist === 0 ? 'fehlt' : 'unvollstaendig';
}

/**
 * Vergleicht, was da ist, mit dem, was der Import hinterlassen hat.
 *
 * Der ganze Sinn der Soll-Zahlen: Ohne sie sieht das Modul nur den Bestand
 * und kann nicht unterscheiden, ob eine Szene geloescht wurde oder ob es nie
 * eine gab. Fehlt die Zahl (mit einer aelteren Fassung importiert), sagt der Befund
 * ausdruecklich `unbekannt` statt etwas zu behaupten.
 *
 * Bestandteile, die es nie gab (Soll 0), tauchen nicht auf — ein Szenario
 * ohne Kreaturen soll keine leere Zeile bekommen. Mehr als erwartet gilt als
 * vollstaendig: Was der Spielleiter dazugestellt hat, ist sein gutes Recht.
 *
 * `bilderIst` kommt von aussen herein: Die Dateien liegen im Datenbaum, nicht
 * in der Welt, und diese Schicht kennt Foundry nicht. `undefined` heisst
 * „nicht nachgesehen".
 */
export function befund(bestand: SzenarioBestand, bilderIst?: number): Teilbefund[] {
  const soll = bestand.soll;

  const zeilen: { teil: Teil; ist: number; soll?: number }[] = [
    { teil: 'journal', ist: bestand.journal?.seiten ?? 0, soll: soll?.seiten },
    { teil: 'anhang', ist: bestand.anhang?.seiten ?? 0, soll: soll?.anhangSeiten },
    { teil: 'handouts', ist: bestand.handouts?.seiten ?? 0, soll: soll?.handoutSeiten },
    { teil: 'szenen', ist: bestand.szenen.length, soll: soll?.szenen },
    { teil: 'aktoren', ist: bestand.aktoren.length, soll: soll?.aktoren },
    { teil: 'effekte', ist: bestand.effekte.length, soll: soll?.effekte },
    { teil: 'bilder', ist: bilderIst ?? 0, soll: soll?.bilder },
  ];

  return zeilen
    .filter((zeile) => zeile.soll !== 0)
    // Kennt der Import seine Zahlen, fehlt aber gerade diese, gab es den
    // Bestandteil zu seiner Zeit noch nicht — die Effekte kamen erst mit
    // spaeter dazu. Dann schweigen wir, statt „unbekannt" zu melden.
    .filter((zeile) => soll === undefined || zeile.soll !== undefined)
    .map((zeile) => ({
      ...zeile,
      zustand:
        zeile.teil === 'bilder' && bilderIst === undefined
          ? 'unbekannt'
          : bewerte(zeile.ist, zeile.soll),
    }));
}

export function bestandAus(welt: Weltabbild): SzenarioBestand[] {
  const nachSchluessel = new Map<string, SzenarioBestand>();

  const eintrag = (schluessel: string): SzenarioBestand => {
    let bestand = nachSchluessel.get(schluessel);
    if (!bestand) {
      bestand = { schluessel, szenen: [], aktoren: [], effekte: [], ordner: [] };
      nachSchluessel.set(schluessel, bestand);
    }
    return bestand;
  };

  const uebernimm = (
    bestand: SzenarioBestand,
    flags: ReturnType<typeof lies>,
  ): void => {
    if (flags.season !== undefined) bestand.season = flags.season;
    if (flags.sourceHash) bestand.sourceHash = flags.sourceHash;
    if (flags.toolVersion) bestand.toolVersion = flags.toolVersion;
    // Die Soll-Zahlen stehen nur am Hauptjournal; von dort werden sie
    // uebernommen, ohne dass ein anderes Dokument sie ueberschreiben kann.
    if (flags.kind === 'journal' && flags.soll) bestand.soll = flags.soll;
    if (flags.importedAt && (!bestand.importedAt || flags.importedAt > bestand.importedAt)) {
      bestand.importedAt = flags.importedAt;
    }
  };

  for (const journal of welt.journale) {
    const flags = lies(journal);
    if (!flags.scenario) continue;
    const bestand = eintrag(flags.scenario);
    if (flags.kind === 'journal') {
      bestand.journal = { id: journal.id, name: journal.name, seiten: journal.seiten.length };
    } else if (flags.kind === 'anhangJournal') {
      bestand.anhang = { id: journal.id, name: journal.name, seiten: journal.seiten.length };
    } else if (flags.kind === 'handoutJournal') {
      bestand.handouts = { id: journal.id, name: journal.name, seiten: journal.seiten.length };
    } else {
      continue;
    }
    uebernimm(bestand, flags);
  }

  for (const szene of welt.szenen ?? []) {
    const flags = lies(szene);
    if (flags.kind !== 'scene' || !flags.scenario) continue;
    const bestand = eintrag(flags.scenario);
    bestand.szenen.push({ id: szene.id, name: szene.name });
    uebernimm(bestand, flags);
  }

  for (const aktor of welt.aktoren ?? []) {
    const flags = lies(aktor);
    if (flags.kind !== 'actor' || !flags.scenario) continue;
    const bestand = eintrag(flags.scenario);
    bestand.aktoren.push({ id: aktor.id, name: aktor.name });
    uebernimm(bestand, flags);
  }

  for (const gegenstand of welt.gegenstaende ?? []) {
    const flags = lies(gegenstand);
    if (flags.kind !== 'effect' || !flags.scenario) continue;
    const bestand = eintrag(flags.scenario);
    bestand.effekte.push({ id: gegenstand.id, name: gegenstand.name });
    uebernimm(bestand, flags);
  }

  for (const ordner of [
    ...welt.ordner,
    ...(welt.szenenOrdner ?? []),
    ...(welt.aktorenOrdner ?? []),
    ...(welt.gegenstandsOrdner ?? []),
  ]) {
    const flags = lies(ordner);
    if (flags.kind !== 'scenarioFolder' || !flags.scenario) continue;
    eintrag(flags.scenario).ordner.push({ id: ordner.id, name: ordner.name });
  }

  return [...nachSchluessel.values()].sort((a, b) =>
    a.schluessel.localeCompare(b.schluessel),
  );
}

/** Ein Ordner, so viel wie Bestaetigung und Loeschung davon brauchen. */
export interface OrdnerTreffer {
  id: string;
  name: string;
}

/**
 * Die Season eines Bestands. Steht sie nicht im Flag, kommt sie aus dem
 * Schluessel — `08-01` heisst Season 8. Aelter importierte Dokumente
 * tragen die Zahl nicht.
 */
function seasonVon(bestand: SzenarioBestand): number | undefined {
  if (bestand.season !== undefined) return bestand.season;
  const zahl = Number(bestand.schluessel.slice(0, 2));
  return Number.isFinite(zahl) && zahl > 0 ? zahl : undefined;
}

/**
 * Ist das ein Season-Ordner einer der genannten Seasons?
 *
 * Zwei Wege, dieselben wie beim Import (`findeSeasonOrdner` in `plan.ts`):
 * unser Flag, sonst der Name auf der obersten Ebene. Der zweite Weg ist der
 * Adoptionspfad — ein Season-Ordner kann von Hand oder von
 * `showstopping_tools` stammen und traegt dann kein Flag von uns. Wer ihn
 * zum Befuellen adoptiert, darf ihn auch leergeraeumt wieder abraeumen.
 *
 * Traegt der Ordner ein **anderes** Flag von uns, ist er keiner: Ein
 * Szenario-Ordner wird ueber seinen eigenen Weg entfernt.
 */
function istSeasonOrdner(ordner: OrdnerAbbild, seasons: number[]): boolean {
  const flags = lies(ordner);
  if (flags.kind !== undefined) {
    return (
      flags.kind === 'seasonFolder' &&
      flags.season !== undefined &&
      seasons.includes(flags.season)
    );
  }
  if (ordner.elternId !== null) return false;
  return seasons.some((season) => passtZuSeason(ordner.name, season));
}

/**
 * Welche Season-Ordner stehen leer da, wenn diese Szenarien entfernt sind?
 *
 * Der Grund fuer die Funktion: Das Entfernen loescht die Szenario-Ordner, der
 * Season-Ordner darueber blieb bisher als leere Huelle stehen. Er darf nicht
 * blind mitgeloescht werden — in derselben Season koennen weitere Szenarien
 * wohnen, und ein Spielleiter kann eigene Journale hineingelegt haben.
 * Deshalb faellt er nur, wenn nach dem Zug **nichts** mehr darin steht: kein
 * Unterordner und kein Dokument.
 *
 * Gerechnet wird **vorher**, gegen den heutigen Weltbestand abzueglich dessen,
 * was gleich verschwindet. So kann die Bestaetigung die Ordner schon nennen —
 * eine Loeschung, die der Dialog nicht aufgezaehlt hat, gaebe es hier sonst
 * nicht.
 *
 * Foundry fuehrt Ordner je Dokumentart; derselbe Season-Ordner existiert
 * darum bis zu viermal (Journal, Szene, Actor, Item) und wird viermal
 * einzeln geprueft.
 */
export function verwaisteSeasonOrdner(
  welt: Weltabbild,
  bestaende: SzenarioBestand[],
): OrdnerTreffer[] {
  const seasons = [
    ...new Set(bestaende.map(seasonVon).filter((s): s is number => s !== undefined)),
  ];
  if (seasons.length === 0) return [];

  const weg = new Set<string>();
  for (const bestand of bestaende) {
    if (bestand.journal) weg.add(bestand.journal.id);
    if (bestand.anhang) weg.add(bestand.anhang.id);
    if (bestand.handouts) weg.add(bestand.handouts.id);
    for (const eintrag of [
      ...bestand.szenen,
      ...bestand.aktoren,
      ...bestand.effekte,
      ...bestand.ordner,
    ]) {
      weg.add(eintrag.id);
    }
  }

  const baeume: { ordner: OrdnerAbbild[]; inhalte: { id: string; ordnerId: string | null }[] }[] = [
    { ordner: welt.ordner, inhalte: welt.journale },
    { ordner: welt.szenenOrdner ?? [], inhalte: welt.szenen ?? [] },
    { ordner: welt.aktorenOrdner ?? [], inhalte: welt.aktoren ?? [] },
    { ordner: welt.gegenstandsOrdner ?? [], inhalte: welt.gegenstaende ?? [] },
  ];

  const treffer: OrdnerTreffer[] = [];
  for (const baum of baeume) {
    for (const ordner of baum.ordner) {
      if (weg.has(ordner.id)) continue;
      if (!istSeasonOrdner(ordner, seasons)) continue;
      const bleibtKind = baum.ordner.some(
        (kind) => kind.elternId === ordner.id && !weg.has(kind.id),
      );
      if (bleibtKind) continue;
      const bleibtInhalt = baum.inhalte.some(
        (dokument) => dokument.ordnerId === ordner.id && !weg.has(dokument.id),
      );
      if (bleibtInhalt) continue;
      treffer.push({ id: ordner.id, name: ordner.name });
    }
  }
  return treffer;
}
