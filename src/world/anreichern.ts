import { withChecks, withConditionLinks, withDamage, withItemLinks } from '../pdf/enrich.ts';
import type { Scenario } from '../pdf/scenario.ts';
import { ladeIndizes, type Indizes } from './compendium-index.ts';

/**
 * Reichert ein gelesenes Szenario mit Foundry-Verweisen an.
 *
 * Die **Reihenfolge ist zwingend**: Proben, dann Schaden, dann Gegenstaende
 * und Zauber, dann Bedingungen. Jeder Durchlauf schuetzt, was die vorigen gesetzt haben;
 * andersherum verschachteln sich die Verweise ineinander — aus einem
 * `@UUID[...]{prone boots}` wuerde ein Verweis auf die Bedingung *prone*
 * mitten im Anzeigetext eines anderen Verweises.
 *
 * Die Bloecke werden dabei **kopiert**, nie beschrieben. Das urspruengliche
 * Szenario behaelt den Wortlaut des PDFs, und ein zweiter Aufruf sieht
 * denselben Ausgangsstand.
 *
 * `optionenJeSeite` reicht Wurf-Optionen an die Proben einer Heftseite durch.
 * Damit grenzt ein Szenario-Effekt seinen Bonus auf eine Begegnung ein — siehe
 * `world/effekte.ts::effektOption`.
 *
 * Kreaturen sind hier nicht dabei: ihre Verweise entstehen nicht im Text,
 * sondern an den Statblock-Ueberschriften, und die setzt `buildPages` selbst,
 * wenn man ihm den Actor-Index mitgibt.
 */
export interface Anreicherung {
  szenario: Scenario;
  indizes: Indizes;
}

export async function reichereAn(
  szenario: Scenario,
  optionenJeSeite: ReadonlyMap<number, string[]> = new Map(),
): Promise<Anreicherung> {
  const indizes = await ladeIndizes();

  const angereichert = withConditionLinks(
    withItemLinks(withDamage(withChecks(szenario, optionenJeSeite)), indizes.items),
    indizes.conditions,
  );

  return { szenario: angereichert, indizes };
}
