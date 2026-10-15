import type { Wand } from './waende.ts';

/**
 * Was das Modul zu einer Karte weiss — **eine Datei je Karte** unter
 * `daten/karten/<szenario>/<datei>.json`.
 *
 * Frueher verteilte sich eine Karte auf drei Stellen: die Wanddatei unter
 * `daten/waende/`, eine Zeile Messwerte in `karten-einstellungen.ts` und zwei
 * Zeilen Registrierung in `waende.ts`. Eine neue Karte war damit eine Datei
 * **und** Codeaenderungen. Jetzt sammelt Vite die Dateien beim Bauen selbst
 * ein (`import.meta.glob`); eine neue Karte ist genau eine neue Datei — die
 * Voraussetzung dafuer, dass ein Karten-PR ohne Codeaenderung auskommt.
 *
 * Die Datei fuehrt nur, was **auf jeder** Welt gleich ist. Bildpfade fehlen
 * bewusst: Das Hintergrundbild entsteht beim Import aus dem PDF und liegt
 * unter der Bildwurzel des Spielleiters.
 */
export interface Kartendaten {
  /**
   * Faktor zwischen Bild- und Leinwandgroesse; fehlt er, gilt 1.
   *
   * Steht nicht an der Szene — `width` ist dort schon Bildmass mal Faktor.
   * Alle Koordinaten der Datei gelten auf der **fertigen** Leinwand.
   */
  skalierung?: number;
  /** Felder des Szenen-Dokuments (`grid`, `shiftX`, `environment` …). */
  szene?: Record<string, unknown>;
  /** Felder der ersten Ebene der Szene, ohne Bildpfade. */
  ebene?: Record<string, unknown>;
  waende?: Wand[];
  lichter?: Record<string, unknown>[];
  regionen?: Record<string, unknown>[];
  /**
   * Notizen; statt `entryId` tragen sie `journal` — die Dokumentart des
   * Ziels (`journal`, `anhangJournal`, `handoutJournal`). Die Kennung des
   * Hauptjournals ist je Welt eine andere, die Seitenkennung nicht.
   */
  notizen?: Record<string, unknown>[];
  zeichnungen?: Record<string, unknown>[];
}

// Der Pfad ist relativ zu **dieser** Datei; Vite loest ihn beim Bauen auf und
// buendelt jede gefundene Datei ein.
const DATEIEN = import.meta.glob<Kartendaten>('../../daten/karten/*/*.json', {
  eager: true,
  import: 'default',
});

/** `../../daten/karten/08-03/the-solstice-theater.json` → `08-03/the-solstice-theater`. */
function schluesselAus(pfad: string): string | undefined {
  return /daten\/karten\/([^/]+\/[^/]+)\.json$/.exec(pfad)?.[1];
}

const KARTEN: ReadonlyMap<string, Kartendaten> = new Map(
  Object.entries(DATEIEN).flatMap(([pfad, daten]) => {
    const schluessel = schluesselAus(pfad);
    return schluessel ? [[schluessel, daten] as const] : [];
  }),
);

/** Die Daten einer Karte, falls das Modul sie fuehrt. */
export function kartenDaten(szenario: string, datei: string): Kartendaten | undefined {
  return KARTEN.get(`${szenario}/${datei}`);
}

/** Alle gefuehrten Karten, Schluessel `<szenario>/<datei>`. */
export function alleKarten(): ReadonlyMap<string, Kartendaten> {
  return KARTEN;
}

/** Ablageort der Datei einer Karte im Repo. */
export function kartendateiPfad(szenario: string, datei: string): string {
  return `daten/karten/${szenario}/${datei}.json`;
}
