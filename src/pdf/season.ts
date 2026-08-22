import type { Block } from './types.ts';

/**
 * Season- und Szenarionummer aus dem Satz lesen.
 *
 * Die Ordner- und Journalnamen des Extractors (`S08 - ...`, `01 - Titel`)
 * stehen bewusst nicht mehr hier: in der Welt gilt das Schema, das
 * `showstopping_tools` erwartet, und das entsteht in `src/world/naming.ts`.
 */

/**
 * Die Namen der Seasons.
 *
 * Sie stehen in den PDFs nirgends verlaesslich: nur die Intro-Szenarien tragen
 * sie im Titel, und die Metaplot-Zeile ist in Kapitaelchen gesetzt und kommt
 * verstuemmelt an (`CloCkwork Mystery`). Deshalb eine gepflegte Tabelle — sie
 * waechst um einen Eintrag je Jahrgang.
 *
 * **Pflegepunkt.** Ein neuer Jahrgang braucht hier einen Eintrag und einen
 * zweiten in `roles.ts` (`DISPLAY_FONTS`) — Paizo wechselt jaehrlich die
 * Hausschrift, und die Ueberschriftenerkennung haengt allein am Schriftnamen.
 * Fehlen die Eintraege, faellt still alles auf Fliesstext zurueck.
 */
export const SEASON_NAMES: Readonly<Record<number, string>> = {
  1: 'Year of the Open Road',
  2: "Year of Corruption's Reach",
  3: 'Year of Shattered Sanctuaries',
  4: 'Year of Boundless Wonder',
  5: 'Year of Unfettered Exploration',
  6: 'Year of Immortal Influence',
  7: "Year of Battle's Spark",
  8: 'Year of Clockwork Mystery',
};

export interface Designation {
  season: number;
  /** Laufende Nummer innerhalb der Season; 99 kennzeichnet ein Special. */
  scenario: number;
}

/** `Pathfinder Society Scenario #8-01: ...` — beide Schreibweisen kommen vor. */
const NUMBERED = /Scenario\s*#\s*(\d+)\s*[-–]\s*(\d+)/;
const BARE = /#\s*(\d+)\s*[-–]\s*(\d+)/;

/**
 * Liest Season- und Szenarionummer aus dem Text.
 *
 * Der Dateiname waere die naheliegende Quelle, aber die unzuverlaessigste: er
 * wird umbenannt, gekuerzt und uebersetzt. Die Nummer dagegen steht im Satz
 * jedes gepruften Szenarios.
 */
export function detectDesignation(blocks: Block[]): Designation | undefined {
  const text = blocks.map((block) => block.text).join(' ');

  for (const pattern of [NUMBERED, BARE]) {
    const found = pattern.exec(text);
    if (found) {
      return { season: Number(found[1]), scenario: Number(found[2]) };
    }
  }

  return undefined;
}

/**
 * Entschaerft einen Namen fuer einen Pfad oder Ordnernamen. Titel enthalten
 * Doppelpunkte (`Intro to the Year of Battle's Spark: Enough is Enough`), die
 * unter Windows unzulaessig sind.
 */
export function sanitisePathSegment(value: string): string {
  return value
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim();
}
