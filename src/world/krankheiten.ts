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
 * ein Absatz — Rettungswurf, Onset, jede Stufe. Der Wortlaut ist der
 * gedruckte (`leseKrankheit` hat die Anreicherung schon zurueckgefuehrt).
 */
export function krankheitSeiteHtml(krankheit: Krankheit): string {
  const absaetze = krankheit.text
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
 * Setzt den Verweis auf die Krankheitsseite an die erste Nennung des Namens
 * im Journal — „exposed to sewer haze".
 *
 * Gesucht wird ohne Ruecksicht auf Gross- und Kleinschreibung, als ganzes
 * Wort, ausserhalb von HTML-Tags und ausserhalb schon gesetzter Verweise.
 * Wird der Name nicht gefunden, bleibt die Seite trotzdem stehen; sie ist
 * dann nur nicht verlinkt, und die Vorschau zaehlt es mit.
 *
 * Zurueck kommt die Zahl der gesetzten Verweise.
 */
export function fuegeKrankheitVerweiseEin(
  seiten: SeitenAbbild[],
  krankheiten: { satz: string; uuid: string }[],
): number {
  let gesetzt = 0;

  for (const krankheit of krankheiten) {
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
