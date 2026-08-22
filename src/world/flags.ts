export const MODULE_ID = 'pfs-scenario-tools';

/**
 * Was dieses Modul auf die Dokumente stempelt, damit ein zweiter Lauf sie
 * wiedererkennt statt sie zu verdoppeln.
 *
 * Wiedererkannt wird immer in dieser Reihenfolge: **Flag, dann Name, dann neu
 * anlegen.** Der Umweg ueber den Namen ist der Adoptionspfad — ein Ordner kann
 * von Hand angelegt oder von `showstopping_tools` uebernommen worden sein und
 * traegt dann kein Flag von uns.
 *
 * Fremde Flags werden **nie** geschrieben. `flags.showstopping_tools.pfsGroup`
 * gehoert dem anderen Modul; es findet unsere Ordner ohnehin ueber den Namen.
 */
export type Dokumentart =
  | 'journal'
  /** Das Spielhilfen-Journal mit einer Bildseite je Anhang-Bild. */
  | 'anhangJournal'
  | 'scene'
  | 'actor'
  /** Ein Effekt-Gegenstand aus einer Zusage des Hefts. */
  | 'effect'
  | 'seasonFolder'
  | 'scenarioFolder';

/**
 * Was der Import angelegt hat — die **Soll-Zahlen**.
 *
 * Ohne sie kann das Modul nur sehen, was da ist, nie was fehlt: Der
 * Weltbestand allein verraet nicht, ob eine Szene von Hand geloescht wurde
 * oder ob es nie eine gab. Deshalb schreibt der Import beim Anlegen mit, wie
 * viel er hinterlassen hat; die Vollstaendigkeitsprobe im Verwaltungsfenster
 * vergleicht dagegen.
 *
 * Steht nur am Hauptjournal, dem einen Dokument, das jedes Szenario hat.
 */
export interface Bestandszahlen {
  seiten: number;
  anhangSeiten: number;
  szenen: number;
  aktoren: number;
  /** Effekt-Gegenstaende; fehlt bei allem, was eine aeltere Fassung anlegte. */
  effekte?: number;
  /** Hochgeladene Bilddateien; sie liegen ausserhalb der Weltdatenbank. */
  bilder: number;
}

export interface Stempel {
  /** Gepaddeter Schluessel, `08-01`. */
  scenario?: string;
  season: number;
  kind: Dokumentart;
  /** Kurzform des Streuwerts der PDF-Bytes; zeigt, aus welcher Datei es kam. */
  sourceHash?: string;
  toolVersion?: string;
  importedAt?: string;
  /** Nur am Hauptjournal; fehlt bei allem, was eine aeltere Fassung anlegte. */
  soll?: Bestandszahlen;
}

export interface MitFlags {
  flags?: Record<string, Record<string, unknown> | undefined>;
}

export function lies(dokument: MitFlags): Partial<Stempel> {
  return (dokument.flags?.[MODULE_ID] ?? {}) as Partial<Stempel>;
}

/** Baut den Flag-Block fuer ein `create` oder `update`. */
export function stempel(werte: Stempel): Record<string, Record<string, unknown>> {
  const inhalt: Record<string, unknown> = {
    season: werte.season,
    kind: werte.kind,
    importedAt: werte.importedAt ?? new Date().toISOString(),
  };
  if (werte.scenario !== undefined) inhalt.scenario = werte.scenario;
  if (werte.sourceHash !== undefined) inhalt.sourceHash = werte.sourceHash;
  if (werte.toolVersion !== undefined) inhalt.toolVersion = werte.toolVersion;
  if (werte.soll !== undefined) inhalt.soll = { ...werte.soll };
  return { [MODULE_ID]: inhalt };
}
