import type { Kartendaten } from './karten.ts';
import { notizInDatei, ohneWeltfelder, type JournalArt } from './kartenabgleich.ts';
import type { Wand } from './waende.ts';

/**
 * Eine vermessene Karte aus einer Szene der Welt zurueckgewinnen: die
 * Kartendatei (`daten/karten/`, siehe `karten.ts`) mit Szenen- und
 * Ebenenfeldern, Waenden, Lichtern, Regionen, Notizen und Zeichnungen.
 *
 * Reine Logik, kein Foundry-Zugriff: Eingabe sind die Quelldaten der Szene
 * aus `toObject()`. Das Fenster „Karte exportieren" (`ui/karten-export-app.ts`)
 * holt sie und bietet das Ergebnis zum Herunterladen an.
 */

/**
 * Die Felder einer Wand in der Kartendatei, in dieser Reihenfolge.
 *
 * Nur, was der Import wieder anlegt: Ids vergibt Foundry neu, und Fremd-Flags
 * (etwa von einem Levels-Modul) gehoeren nicht ins Repo.
 */
export const EXPORT_FELDER = [
  'c',
  'move',
  'sight',
  'sound',
  'light',
  'dir',
  'door',
  'ds',
  'threshold',
  'animation',
] as const;

export interface Wandauszug {
  waende: Wand[];
  /** Tueren einschliesslich Geheimtueren (`door 2`), wie das Werkzeug zaehlt. */
  tueren: number;
  /**
   * Deckungsgleiche Doppel, die uebersprungen wurden.
   *
   * Sie entstehen nicht beim Zeichnen, sondern waren die Altlast des
   * Verdopplungs-Fehlers vom 13.08.2026. Die Zahl gehoert sichtbar in den
   * Bericht — ein unerwartet hoher Schwund soll auffallen.
   */
  doppel: number;
  /**
   * Waende ohne brauchbare Koordinaten.
   *
   * Sollte nie vorkommen; eine solche Wand im Repo waere aber schlimmer als
   * eine fehlende, deshalb fliegt sie raus und wird gemeldet.
   */
  verworfen: number;
}

function istKoordinate(wert: unknown): wert is number[] {
  return (
    Array.isArray(wert) &&
    wert.length === 4 &&
    wert.every((zahl) => typeof zahl === 'number' && Number.isFinite(zahl))
  );
}

/**
 * Dickt die Rohdaten der Waende einer Szene auf die Exportfelder ein.
 *
 * Erwartet wird, was `WallDocument#toObject()` liefert — die Quelldaten, nicht
 * die abgeleiteten Felder des Dokuments.
 */
export function wandauszug(roh: readonly Record<string, unknown>[]): Wandauszug {
  const waende: Wand[] = [];
  const gesehen = new Set<string>();
  let doppel = 0;
  let verworfen = 0;

  for (const eintrag of roh) {
    if (!istKoordinate(eintrag.c)) {
      verworfen++;
      continue;
    }
    const wand: Record<string, unknown> = {};
    for (const feld of EXPORT_FELDER) {
      if (eintrag[feld] !== undefined) wand[feld] = eintrag[feld];
    }
    const kennung = JSON.stringify(wand);
    if (gesehen.has(kennung)) {
      doppel++;
      continue;
    }
    gesehen.add(kennung);
    waende.push(wand as unknown as Wand);
  }

  const tueren = waende.filter((wand) => Number(wand.door ?? 0) > 0).length;
  return { waende, tueren, doppel, verworfen };
}

/** Kennung einer Karte, aus dem Pfad ihres Hintergrundbildes gelesen. */
export interface Kartenkennung {
  /** Gepaddet, `08-01`; fehlt, wenn der Pfad nicht dem Ablageschema folgt. */
  szenario?: string;
  /** Dateiname ohne Endung, `the-laboratory`. */
  datei: string;
}

/** `pfs_s08_01` — die Umkehrung von `szenarioBildOrdner` in `bilder.ts`. */
const BILDORDNER = /(?:^|\/)pfs_s(\d{2})_(\d{2})(?:\/|$)/;

/**
 * Liest Szenario und Dateinamen aus dem Pfad des Hintergrundbildes.
 *
 * Das ist der einzige Weg zum Dateinamen: Die Szene traegt ihn nirgends, und
 * ihr Anzeigename ist der Kartentitel, der mit dem Dateinamen nicht
 * uebereinstimmen muss (`Nan's Watch` gegen `nans-watch`). Der Szenario-
 * Schluessel steht zusaetzlich in den Flags — der Aufrufer soll ihm den
 * Vorzug geben, er ist die verlaesslichere Quelle.
 */
export function kartenkennungAusPfad(pfad: string): Kartenkennung | undefined {
  const ohneAbfrage = pfad.split(/[?#]/)[0] ?? '';
  const datei = ohneAbfrage.slice(ohneAbfrage.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  if (datei === '') return undefined;
  const treffer = BILDORDNER.exec(ohneAbfrage);
  if (!treffer) return { datei };
  return { szenario: `${treffer[1]}-${treffer[2]}`, datei };
}

/**
 * Der Faktor zwischen Bild- und Leinwandgroesse.
 *
 * Er steht **nicht** an der Szene: `width` ist schon das Produkt aus
 * Bildbreite und Faktor, `apply.ts` rechnet ihn beim Anlegen hinein. Wer ihn
 * zurueckhaben will, muss die Leinwand durch das Bild teilen.
 *
 * Gerundet auf zwei Stellen, und auf eine ganze Zahl, wenn er ihr nahe liegt:
 * Die Leinwand entsteht mit `Math.round`, ein Faktor 2 kommt dadurch als
 * 1.9996 zurueck.
 */
export function skalierungAus(
  leinwandBreite: number,
  bildBreite: number,
): number | undefined {
  if (!Number.isFinite(leinwandBreite) || !Number.isFinite(bildBreite)) return undefined;
  if (leinwandBreite <= 0 || bildBreite <= 0) return undefined;
  const roh = leinwandBreite / bildBreite;
  const ganz = Math.round(roh);
  if (ganz >= 1 && Math.abs(roh - ganz) < 0.01) return ganz;
  return Math.round(roh * 100) / 100;
}

/**
 * Die Felder des Szenen-Dokuments, die in die Kartendatei gehen — als Pfade.
 *
 * Alles, was auf jeder Welt gleich sein soll. Nicht dabei: Bildpfade
 * (`thumb`, `fog.overlay`), alles Weltgebundene (Name, Ordner, Rechte,
 * Navigation, Playlist, Journal, `active`), die Startansicht (`initial`,
 * `initialLevel`, auf Wunsch des Autors) und `fog.reset` (ein Zeitstempel).
 * Breite und Hoehe ergeben sich aus Bildmass und `skalierung`.
 */
export const SZENEN_FELDER = [
  'grid',
  'shiftX',
  'shiftY',
  'padding',
  'tokenVision',
  'fog.mode',
  'fog.colors',
  'environment',
  'weather',
  'transition',
] as const;

/**
 * Die Felder der ersten Ebene, die in die Kartendatei gehen. Die Bildpfade
 * (`background.src`, `foreground.src`, `fog.src`) bleiben draussen — das
 * Hintergrundbild entsteht in jeder Welt neu aus dem PDF. `visibility` auch:
 * Es verweist auf andere Ebenen, und die Module legen nur eine an.
 */
export const EBENEN_FELDER = [
  'elevation',
  'background.color',
  'background.tint',
  'background.alphaThreshold',
  'foreground.tint',
  'foreground.alphaThreshold',
  'textures',
] as const;

/**
 * Regionsverhalten, die Code ausfuehren. Sie kommen nicht in die Datei: Ein
 * oeffentliches Repo, dessen Karten in jeder Welt Skripte anlegen, waere
 * eine Einladung — und ein Makro-Verweis zeigt ohnehin auf ein Dokument, das
 * es nur in der Welt des Autors gibt.
 */
const VERHALTEN_OHNE = ['executeScript', 'executeMacro'];

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/** Holt die Pfade aus `quelle` in ein neues Objekt; fehlende bleiben weg. */
export function waehleFelder(
  quelle: Record<string, unknown>,
  pfade: readonly string[],
): Record<string, unknown> {
  const ziel: Record<string, unknown> = {};
  for (const pfad of pfade) {
    const teile = pfad.split('.');
    let wert: unknown = quelle;
    for (const teil of teile) wert = istObjekt(wert) ? wert[teil] : undefined;
    if (wert === undefined) continue;
    let knoten = ziel;
    teile.slice(0, -1).forEach((teil) => {
      if (!istObjekt(knoten[teil])) knoten[teil] = {};
      knoten = knoten[teil] as Record<string, unknown>;
    });
    knoten[teile[teile.length - 1]!] = wert;
  }
  return ziel;
}

/**
 * Ein Bildpfad darf bleiben, wenn er zu Foundry selbst gehoert (`icons/…`) —
 * den gibt es in jeder Installation. Alles andere liegt im Datenbaum des
 * Autors.
 */
function istKernbild(pfad: unknown): boolean {
  return typeof pfad === 'string' && pfad.startsWith('icons/');
}

function liste(wert: unknown): Record<string, unknown>[] {
  return Array.isArray(wert) ? wert.filter(istObjekt) : [];
}

/**
 * Feste Reihenfolge fuer die Datei: nach Lage auf der Karte (Wandkoordinaten,
 * sonst `x`/`y`), bei Gleichstand nach dem ganzen Eintrag.
 *
 * Foundry liefert eingebettete Dokumente nicht in der Reihenfolge, in der der
 * Import sie angelegt hat. Ohne Sortierung zeigte der Diff eines Karten-PR
 * jede Wand als verschoben, obwohl sich keine geaendert hat.
 */
export function sortiert<T extends Record<string, unknown>>(eintraege: readonly T[]): T[] {
  const lage = (eintrag: T): number[] =>
    Array.isArray(eintrag.c)
      ? (eintrag.c as number[])
      : [Number(eintrag.x ?? 0), Number(eintrag.y ?? 0)];
  return [...eintraege]
    .map((eintrag) => ({ eintrag, lage: lage(eintrag), text: JSON.stringify(eintrag) }))
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.lage.length, b.lage.length); i++) {
        const unterschied = (a.lage[i] ?? 0) - (b.lage[i] ?? 0);
        if (unterschied !== 0) return unterschied;
      }
      return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
    })
    .map(({ eintrag }) => eintrag);
}

/** Was der Export gefunden und was er dabei weggelassen hat. */
export interface Kartenauszug {
  daten: Kartendaten;
  waende: Wandauszug;
  lichter: number;
  regionen: number;
  notizen: number;
  zeichnungen: number;
  /** Regionsverhalten mit Skript oder Makro, siehe `VERHALTEN_OHNE`. */
  verhaltenVerworfen: number;
  /** Notizen, die auf ein Journal ausserhalb des Moduls zeigten. */
  verweiseEntfernt: number;
  /** Bildpfade an Notizen und Zeichnungen, die nicht zu Foundry gehoeren. */
  bilderEntfernt: number;
}

/**
 * Baut die Kartendatei aus den Quelldaten einer Szene.
 *
 * Leere Sammlungen kommen **nicht** in die Datei. Eine Liste in der Datei
 * heisst fuer den Import „das Repo ist die Quelle", er ersetzt dann, was in
 * der Szene steht. Eine leere Liste wuerde so bei jedem Import die eigenen
 * Notizen oder Lichter des Spielleiters loeschen — fuer eine Karte, zu der
 * der Autor gar keine gesetzt hat.
 */
export function kartenauszug(
  szene: Record<string, unknown>,
  optionen: { skalierung: number; artVon: (journalId: string) => JournalArt | undefined },
): Kartenauszug {
  let bilderEntfernt = 0;
  let verweiseEntfernt = 0;
  let verhaltenVerworfen = 0;

  const waende = wandauszug(liste(szene.walls));
  const lichter = liste(szene.lights).map((eintrag) => ohneWeltfelder(eintrag));

  // Regionen behalten ihre Kennung: Verhalten verweisen darueber
  // aufeinander, `apply.ts` legt sie mit `keepId` an.
  const regionen = liste(szene.regions).map((region) => {
    const verhalten = liste(region.behaviors).filter((eintrag) => {
      const raus = VERHALTEN_OHNE.includes(String(eintrag.type));
      if (raus) verhaltenVerworfen++;
      return !raus;
    });
    return {
      ...ohneWeltfelder(region, ['_id']),
      behaviors: verhalten.map((eintrag) => ohneWeltfelder(eintrag, ['_id'])),
    };
  });

  const notizen = liste(szene.notes).map((roh) => {
    const { notiz, verweisEntfernt } = notizInDatei(roh, optionen.artVon);
    if (verweisEntfernt) verweiseEntfernt++;
    const textur = notiz.texture;
    if (istObjekt(textur) && textur.src && !istKernbild(textur.src)) {
      bilderEntfernt++;
      const { src: _weg, ...rest } = textur;
      return { ...notiz, texture: rest };
    }
    return notiz;
  });

  const zeichnungen = liste(szene.drawings).map((roh) => {
    // `author` ist ein Benutzer der Welt des Autors; Foundry setzt beim
    // Anlegen den, der importiert.
    const { author: _autor, ...zeichnung } = ohneWeltfelder(roh);
    if (zeichnung.texture && !istKernbild(zeichnung.texture)) {
      bilderEntfernt++;
      const { texture: _weg, ...rest } = zeichnung;
      return rest;
    }
    return zeichnung;
  });

  const ebene = liste(szene.levels)[0];
  const daten: Kartendaten = {
    ...(optionen.skalierung !== 1 ? { skalierung: optionen.skalierung } : {}),
    szene: waehleFelder(szene, SZENEN_FELDER),
    ...(ebene ? { ebene: waehleFelder(ebene, EBENEN_FELDER) } : {}),
    ...(waende.waende.length > 0 ? { waende: sortiert(waende.waende) } : {}),
    ...(lichter.length > 0 ? { lichter: sortiert(lichter) } : {}),
    ...(regionen.length > 0 ? { regionen: sortiert(regionen) } : {}),
    ...(notizen.length > 0 ? { notizen: sortiert(notizen) } : {}),
    ...(zeichnungen.length > 0 ? { zeichnungen: sortiert(zeichnungen) } : {}),
  };

  return {
    daten,
    waende,
    lichter: lichter.length,
    regionen: regionen.length,
    notizen: notizen.length,
    zeichnungen: zeichnungen.length,
    verhaltenVerworfen,
    verweiseEntfernt,
    bilderEntfernt,
  };
}

/**
 * Die Kartendatei als Text: zwei Leerzeichen Einrueckung und ein Zeilenende
 * am Schluss — dieselbe Form wie die Dateien im Repo, damit `git diff` nur
 * zeigt, was sich wirklich geaendert hat.
 */
export function kartendateiText(daten: Kartendaten): string {
  return `${JSON.stringify(daten, null, 2)}\n`;
}
