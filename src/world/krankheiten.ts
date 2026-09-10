/**
 * Die Krankheiten des Hefts (`pdf/krankheiten.ts`) als Textseite im
 * Spielhilfen-Journal — und der Verweis darauf im Haupttext.
 *
 * **Kein Gegenstand.** Der erste Entwurf (11.09.2026) baute je Krankheit
 * einen Affliction-Gegenstand nach dem Schema des Systems; die Instanz warf
 * beim Anlegen `Affliction items are not available in production builds`.
 * Der Typ steht im pf2e-Quelltext (`item/affliction/document.ts`) hinter
 * `BUILD_MODE === "production"` — jede ausgelieferte Systemfassung sperrt
 * ihn. Das System selbst setzt Krankheiten als Effekt mit Stufenzaehler
 * (`effect-flesh-mutation`); der Autor wollte stattdessen die Seite: Sie
 * zeigt den Statblock wie gedruckt, laesst sich am Tisch teilen und braucht
 * keinen Nachbau der Regeln.
 *
 * Diese Datei **schreibt nichts** und kennt Foundry nicht.
 */
import { escapeHtml, inlineHtml } from '../pdf/journal.ts';
import type { Krankheit } from '../pdf/krankheiten.ts';
import type { SeitenAbbild } from './plan.ts';

/** Der Seitenname im Spielhilfen-Journal — wie die Kopfzeile im Heft. */
export function krankheitSeitenName(krankheit: Krankheit): string {
  return `${krankheit.name} (Disease ${krankheit.stufe})`;
}

/**
 * Der Statblock als Seite: die Plakette, dann je Abschnitt des Werteblocks
 * ein Absatz — Rettungswurf, Onset, jede Stufe. Genommen wird der
 * **angereicherte** Text: Der Rettungswurf ist dann ein `@Check`, jede
 * Bedingung ein `@UUID` auf das Kompendium — anklickbar wie im Haupttext.
 */
export function krankheitSeiteHtml(krankheit: Krankheit): string {
  const absaetze = krankheit.quelltext
    .split(/;\s*/)
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '')
    .map((teil) => `<p>${inlineHtml(teil)}</p>`);
  const plakette =
    krankheit.merkmale.length > 0
      ? [`<p><em>${escapeHtml(krankheit.merkmale.join(', '))}</em></p>`]
      : [];
  return [...plakette, ...absaetze].join('\n');
}

function regexSicher(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Setzt die Verweise auf die Krankheitsseite in den Haupttext — an zwei
 * Stellen, wie bei einer Kreatur:
 *
 * - an die **Kopfzeile** der Begegnung (`<h3>Sewer Haze Disease 7</h3>`, im
 *   Heft mit dem Kurzverweis `Page 11` darunter), das ist die Leiste, von
 *   der aus der Spielleiter nachschlaegt;
 * - an die **erste Nennung** des Namens im Fliesstext („exposed to sewer
 *   haze").
 *
 * Gesucht wird ohne Ruecksicht auf Gross- und Kleinschreibung, als ganzes
 * Wort, ausserhalb von HTML-Tags und ausserhalb schon gesetzter Verweise.
 * Wird nichts gefunden, bleibt die Seite trotzdem stehen; sie ist dann nur
 * nicht verlinkt, und die Vorschau zaehlt es mit.
 *
 * Zurueck kommt die Zahl der gesetzten Verweise.
 */
export function fuegeKrankheitVerweiseEin(
  seiten: SeitenAbbild[],
  krankheiten: { satz: string; kopfzeile?: string; uuid: string }[],
): number {
  let gesetzt = 0;

  for (const krankheit of krankheiten) {
    if (krankheit.kopfzeile !== undefined) {
      const kopf = new RegExp(
        `(<h[1-6][^>]*>)(${regexSicher(krankheit.kopfzeile)})(</h[1-6]>)`,
        'iu',
      );
      for (const seite of seiten) {
        if (!kopf.test(seite.inhalt)) continue;
        seite.inhalt = seite.inhalt.replace(kopf, `$1@UUID[${krankheit.uuid}]{$2}$3`);
        gesetzt++;
        break;
      }
    }

    const muster = new RegExp(
      `(^|[^\\p{L}\\p{N}@{\\[])(${regexSicher(krankheit.satz)})(?![\\p{L}\\p{N}])(?![^<]*>)(?![^\\[]*\\])`,
      'iu',
    );
    for (const seite of seiten) {
      if (!muster.test(seite.inhalt)) continue;
      seite.inhalt = seite.inhalt.replace(muster, `$1@UUID[${krankheit.uuid}]{$2}`);
      gesetzt++;
      break;
    }
  }

  return gesetzt;
}
