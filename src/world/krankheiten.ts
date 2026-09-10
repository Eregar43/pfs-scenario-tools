/**
 * Baut aus den Krankheiten des Hefts (`pdf/krankheiten.ts`) Affliction-
 * Gegenstaende fuer PF2e — und setzt den Verweis darauf in den Journaltext.
 *
 * Das Schema ist abgelesen, nicht erinnert: `src/module/item/affliction/
 * data.ts` des pf2e-Systems (`defineSchema`). Eine Affliction ist dort ein
 * Untertyp des abstrakten Effekts, mit Rettungswurf, Onset und Stufen; jede
 * Stufe traegt Bedingungen, Schaden und eine Dauer. Genau das druckt der
 * Krankheits-Statblock.
 *
 * Zwei Dinge sind anders als beim Effekt:
 *
 * - `disease` und `virulent` sind im System **keine** Effekt-Merkmale
 *   (`effectTraits` kennt sie nicht, sie gehoeren zu `hazardTraits`), und
 *   `traits.value` ist ein `LaxArrayField`, das Unbekanntes stillschweigend
 *   verwirft. Sie stehen deshalb in `traits.otherTags` (freie Schlagwoerter)
 *   und in der Beschreibung.
 * - Verlinkt wird nicht ein Satz, sondern die **erste Nennung des Namens**
 *   im Journal — „exposed to sewer haze".
 *
 * Diese Datei **schreibt nichts** und kennt Foundry nicht.
 */
import { escapeHtml, inlineHtml } from '../pdf/journal.ts';
import type { Krankheit, Zeitspanne } from '../pdf/krankheiten.ts';
import type { SeitenAbbild } from './plan.ts';

/** Das Standardsymbol des Systems fuer Afflictions. */
const SYMBOL = 'systems/pf2e/icons/default-icons/affliction.svg';

/** Der Name in der Seitenleiste: Kennung vorn, wie bei den Effekten. */
export function krankheitName(krankheit: Krankheit, schluessel: string): string {
  return `PFS ${schluessel}: ${krankheit.name} (Disease ${krankheit.stufe})`;
}

/**
 * Der Statblock-Text als HTML fuer die Beschreibung: Fett und Kursiv aus dem
 * Blockstrom bleiben erhalten, alles andere wird maskiert.
 */
function beschreibung(krankheit: Krankheit): string {
  const merkmale =
    krankheit.merkmale.length > 0
      ? `<p><em>${escapeHtml(krankheit.merkmale.join(', '))}</em></p>`
      : '';
  return `${merkmale}<p>${inlineHtml(krankheit.text)}</p>`;
}

function dauer(spanne: Zeitspanne): { value: number; unit: string } {
  return { value: spanne.wert, unit: spanne.einheit };
}

/** Die Gegenstandsdaten einer Krankheit. */
export function baueKrankheit(
  krankheit: Krankheit,
  schluessel: string,
  quelle?: string,
): Record<string, unknown> {
  return {
    name: krankheitName(krankheit, schluessel),
    type: 'affliction',
    img: SYMBOL,
    // Ohne Sichtrecht taucht die Krankheit in der Seitenleiste der Spieler
    // nicht auf; wie bei den Effekten.
    ownership: { default: 0 },
    system: {
      description: { value: beschreibung(krankheit) },
      level: { value: krankheit.stufe },
      traits: { value: [], otherTags: krankheit.merkmale },
      save: {
        type: krankheit.rettungswurf?.art ?? 'fortitude',
        value: krankheit.rettungswurf?.dc ?? 0,
      },
      onset: krankheit.onset ? dauer(krankheit.onset) : null,
      status: { onset: krankheit.onset !== undefined, stage: 1, progress: 0 },
      stages: krankheit.stufen.map((stufe) => ({
        damage: stufe.schaden.map((schaden) => ({
          formula: schaden.formel,
          damageType: schaden.art,
          category: null,
        })),
        conditions: stufe.bedingungen.map((bedingung) => ({
          slug: bedingung.slug,
          value: bedingung.wert ?? null,
          linked: true,
        })),
        effects: [],
        // Ohne Angabe bleibt es bei der Vorgabe des Systems (1 Runde).
        duration: stufe.dauer ? dauer(stufe.dauer) : { value: 1, unit: 'rounds' },
      })),
      duration: krankheit.hoechstdauer
        ? { ...dauer(krankheit.hoechstdauer), expiry: null }
        : { value: -1, unit: 'unlimited', expiry: null },
      start: { value: 0, initiative: null },
      fromSpell: false,
      publication: {
        title: quelle ?? '',
        authors: '',
        license: 'ORC',
        remaster: true,
      },
    },
  };
}

function regexSicher(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Setzt den Verweis auf die Krankheit an ihre erste Nennung im Journal.
 *
 * Gesucht wird der Name ohne Rueksicht auf Gross- und Kleinschreibung, als
 * ganzes Wort, ausserhalb von HTML-Tags und ausserhalb schon gesetzter
 * Verweise. Wird er nicht gefunden, bleibt die Krankheit trotzdem stehen; sie
 * ist dann nur nicht verlinkt, und die Vorschau zaehlt es mit.
 *
 * Zurueck kommt die Zahl der gesetzten Verweise.
 */
export function fuegeKrankheitVerweiseEin(
  seiten: SeitenAbbild[],
  krankheiten: { satz: string; id: string; name: string }[],
): number {
  let gesetzt = 0;

  for (const krankheit of krankheiten) {
    const muster = new RegExp(
      `(^|[^\\p{L}\\p{N}@{\\[])(${regexSicher(krankheit.satz)})(?![\\p{L}\\p{N}])(?![^<]*>)(?![^\\[]*\\])`,
      'iu',
    );
    for (const seite of seiten) {
      if (!muster.test(seite.inhalt)) continue;
      seite.inhalt = seite.inhalt.replace(muster, `$1@UUID[Item.${krankheit.id}]{$2}`);
      gesetzt++;
      break;
    }
  }

  return gesetzt;
}
