import type { ScenarioProfile } from './profile.ts';
import type { Designation } from './season.ts';
import type { Block } from './types.ts';

/**
 * Ein ausgelesenes Szenario — das Ergebnis der gesamten PDF-Seite dieses
 * Moduls und zugleich das Einzige, was die Weltschicht davon zu sehen bekommt.
 *
 * Deshalb steht der Typ in einer eigenen Datei und nicht bei `extract.ts`, das
 * ihn erzeugt: Wer ihn braucht — die Journalerzeugung, spaeter die
 * Weltablage —, soll ihn bekommen koennen, ohne dafuer pdf.js mitzuziehen.
 * Er ist die Naht zwischen `src/pdf/` und `src/world/`, und eine Naht sieht
 * man besser, wenn sie einen eigenen Ort hat.
 */
export interface Scenario {
  title: string;
  pageCount: number;
  blocks: Block[];
  /** Season- und Szenarionummer, sofern im Satz zu finden. */
  designation?: Designation;
  /** Wie dieses Szenario gesetzt ist — siehe `profile.ts`. */
  profile: ScenarioProfile;
}
