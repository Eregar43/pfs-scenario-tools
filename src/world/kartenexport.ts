import type { Wand } from './waende.ts';

/**
 * Eine vermessene Karte aus einer Szene der Welt zurueckgewinnen: Masse und
 * Waende in genau der Form, die `daten/waende/` und
 * `karten-einstellungen.ts` fuehren.
 *
 * Reine Logik, kein Foundry-Zugriff — das Gegenstueck zu
 * `tools/exportiere-waende.mjs`, das dasselbe von **aussen** holt: als
 * Textsuche ueber die LevelDB-Dateien der Welt, samt Blockstruktur der
 * `.log`-Dateien. Der Weg von innen ist der bessere, weil die Szene ihre
 * Werte selbst nennt; das Werkzeug bleibt fuer den Fall, dass Foundry gar
 * nicht laeuft.
 *
 * Damit beide dasselbe liefern, steht hier dieselbe Feldliste und dieselbe
 * Schreibform — `wanddateiText` ist zeichengleich zur Ausgabe des Werkzeugs.
 */

/**
 * Die Felder, die eine Wanddatei fuehrt — **dieselbe Liste und dieselbe
 * Reihenfolge** wie in `tools/exportiere-waende.mjs`.
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

/** Die Messwerte einer Karte, wie `KARTEN_EINSTELLUNGEN` sie fuehrt. */
export interface Kartenmasse {
  gitter: number;
  versatzX: number;
  versatzY: number;
  /** Faktor zwischen Bild- und Leinwandgroesse; 1 wird nicht eingetragen. */
  skalierung?: number;
}

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

/**
 * Die Wanddatei als Text.
 *
 * Zwei Leerzeichen Einrueckung und ein Zeilenende am Schluss — zeichengleich
 * zur Ausgabe von `tools/exportiere-waende.mjs`. Sonst zeigte `git diff` beim
 * Wechsel des Werkzeugs jede Zeile jeder Datei als geaendert.
 */
export function wanddateiText(waende: readonly Wand[]): string {
  return `${JSON.stringify(waende, null, 2)}\n`;
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
 * Bezeichner der Import-Zeile in `waende.ts`: `waende0801TheLaboratory`.
 *
 * Die vorhandenen Zeilen tragen von Hand gekuerzte Namen (`waende0801Labor`).
 * Der erzeugte Name ist laenger, dafuer eindeutig aus dem Schluessel
 * ableitbar — was er sein muss, solange ihn niemand nachliest.
 */
export function wandBezeichner(szenario: string, datei: string): string {
  const nummer = szenario.replace(/\D/g, '');
  const name = datei
    .split(/[^A-Za-z0-9]+/)
    .filter((teil) => teil !== '')
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1))
    .join('');
  return `waende${nummer}${name}`;
}

/** Was eine neue Karte im Quelltext braucht — fertig zum Einsetzen. */
export interface Quelltextzeilen {
  /** Ablageort der Wanddatei im Repo. */
  dateipfad: string;
  /** Die Import-Zeile am Kopf von `src/world/waende.ts`. */
  importZeile: string;
  /** Der Eintrag in der Tabelle `WAENDE` derselben Datei. */
  tabellenZeile: string;
  /** Der Eintrag in `KARTEN_EINSTELLUNGEN`. */
  einstellungsZeile: string;
}

/**
 * Die drei Zeilen, mit denen eine neue Karte im Modul ankommt.
 *
 * Solange die Registrierung im Quelltext steht, kann ein Export sie nicht
 * selbst setzen — er kann sie aber **vorschreiben**, und genau das ist der
 * Inhalt eines Pull Requests: eine neue Datei und drei Zeilen.
 */
export function quelltextzeilen(
  szenario: string,
  datei: string,
  masse: Kartenmasse,
): Quelltextzeilen {
  const schluessel = `${szenario}/${datei}`;
  const bezeichner = wandBezeichner(szenario, datei);
  // Skalierung 1 bleibt weg: Das Feld ist optional, und `apply.ts` nimmt 1 an.
  const werte = [
    `gitter: ${masse.gitter}`,
    `versatzX: ${masse.versatzX}`,
    `versatzY: ${masse.versatzY}`,
    ...(masse.skalierung !== undefined && masse.skalierung !== 1
      ? [`skalierung: ${masse.skalierung}`]
      : []),
  ].join(', ');

  return {
    dateipfad: `daten/waende/${schluessel}.json`,
    importZeile: `import ${bezeichner} from '../../daten/waende/${schluessel}.json';`,
    tabellenZeile: `  '${schluessel}': ${bezeichner},`,
    einstellungsZeile: `  '${schluessel}': { ${werte} },`,
  };
}
