import { SEASON_NAMES, sanitisePathSegment, type Designation } from '../pdf/season.ts';

/**
 * Wie Ordner und Journale in der Welt heissen.
 *
 * Das Schema stammt **nicht** von hier, sondern von `showstopping_tools`:
 * dessen Makro "Build PFS Adventures" liest die Weltordner und baut daraus
 * Abenteuer. Wer hier etwas aendert, muss dort nachsehen — die Regeln liegen
 * in `scripts/macros/build-pfs-adventures.js` und sind bewusst kopiert, weil
 * es kein gemeinsames Paket gibt.
 *
 * Die entscheidende Feinheit steckt im Szenario-Ordner: die Nummer ist dort
 * **ungepaddet** und durch ein **Leerzeichen** vom Titel getrennt
 * (`8-01 Titel`), denn drueben steht
 *
 *     const SCENARIO_RE = /^(\d+)\s*-\s*(\d+)\s+(.+)$/;
 *
 * Ein `08-01 - Titel` passt da zwar auch (`\s*-\s*` frisst den Bindestrich
 * nicht, wohl aber `\s+` das Leerzeichen — der Titel hiesse dann `- Titel`).
 * Der Schluessel in Flags und Metadaten ist umgekehrt **gepaddet**: `08-01`.
 */

export type JournalNameSchema = 'kurz' | 'pfs';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Der Schluessel, unter dem ein Szenario ueberall wiedererkannt wird —
 * gepaddet, wie ihn auch `data/pfs-scenario-metadata.json` in
 * `showstopping_tools` benutzt.
 */
export function scenarioKey(designation: Designation): string {
  return `${pad2(designation.season)}-${pad2(designation.scenario)}`;
}

/** `Season 8 - Year of Clockwork Mystery` */
export function seasonFolderName(season: number): string {
  const name = SEASON_NAMES[season];
  return sanitisePathSegment(name ? `Season ${season} - ${name}` : `Season ${season}`);
}

/**
 * `8-01 Intro to the Year of Clockwork Mystery`
 *
 * Nummer ungepaddet, Leerzeichen vor dem Titel — siehe oben.
 */
export function scenarioFolderName(designation: Designation, titel: string): string {
  return sanitisePathSegment(
    `${designation.season}-${pad2(designation.scenario)} ${titel}`,
  );
}

/**
 * Der Name des Journals.
 *
 * `kurz` ist gleichlautend mit dem Ordner (`8-01 Titel`) und liest sich in der
 * Seitenleiste am ruhigsten. `pfs` folgt der Schreibweise, die
 * `showstopping_tools` seinen Abenteuern gibt (`PFS #08-01 - Titel`) — sinnvoll
 * fuer alle, die beides nebeneinander stehen haben. Auf die Wiedererkennung
 * hat die Wahl keinen Einfluss, die laeuft ueber Flags.
 */
export function journalName(
  designation: Designation | undefined,
  titel: string,
  schema: JournalNameSchema = 'kurz',
): string {
  if (!designation) return titel;
  if (schema === 'pfs') return `PFS #${scenarioKey(designation)} - ${titel}`;
  return scenarioFolderName(designation, titel);
}

/**
 * Die Quellenangabe, wie sie in `system.details.publication.title` gehoert:
 * `Pathfinder Society Scenario #8-04: A Theft in Harborgate`.
 *
 * Der Wortlaut ist **abgelesen**, nicht gewaehlt: Genau so steht er an den
 * Kreaturen und Gefahren des Season-7-Moduls in der laufenden Welt
 * (`Pathfinder Society Scenario #7-03: A Foot in the Door`). Die
 * Szenarionummer ist dort gepaddet, die Season nicht — wie im Ordnernamen.
 */
export function quellenangabe(designation: Designation, titel: string): string {
  return `Pathfinder Society Scenario #${designation.season}-${pad2(designation.scenario)}: ${titel}`;
}

/** `/^Season\s+8\b/i` — erkennt auch `Season 8 - Year of Clockwork Mystery`. */
export function passtZuSeason(ordnerName: string, season: number): boolean {
  return new RegExp(`^Season\\s+${season}\\b`, 'i').test(ordnerName);
}

/**
 * Liest den Schluessel aus einem Szenario-Ordnernamen.
 *
 * Toleranter als das Erzeugen: `8-01 Titel` und `08-01 Titel` ergeben beide
 * `08-01`, denn der Ordner kann von Hand oder von einem anderen Werkzeug
 * stammen.
 */
export function schluesselAusOrdnername(name: string): string | undefined {
  const treffer = /^(\d+)\s*-\s*(\d+)\s+(.+)$/.exec(name);
  if (!treffer) return undefined;
  return `${pad2(Number(treffer[1]))}-${pad2(Number(treffer[2]))}`;
}
