/**
 * Baut Actors fuer die Personen, die das Heft **zeigt, aber nicht ausrechnet**.
 *
 * In 8-04 sind das `First Mate Marrowen Ravel`, `Tolla` und `Emrick`: Sie
 * haben ein Bild im Anhang „Game Aids", aber keinen Statblock. Am Spieltisch
 * will man sie trotzdem als Token setzen und ansprechen koennen.
 *
 * Das Vorbild sind die offiziellen Season-Module. Nachgesehen an
 * `Verren Sallo` aus `pf2e-pfs07-year-of-battles-spark` in der
 * laufenden Welt — nicht erfunden:
 *
 * - ein Actor vom Typ `npc`, Stufe 1, 10 Trefferpunkte, sonst nichts,
 * - `flags.core.sheetClass` auf `pf2e.SimpleNPCSheet` (das schlanke Blatt des
 *   Systems; es ist mit `canBeDefault: false` registriert, muss also am
 *   einzelnen Dokument zugewiesen werden),
 * - `system.details.privateNotes` mit einem Verweis auf die Journalseite,
 * - `system.traits.rarity` auf `unique` — die Person gibt es genau einmal,
 * - `system.details.alliance` auf `null`, was im System **Neutral** heisst,
 * - das Bild aus dem Heft an `img`.
 *
 * Die Quellenangabe (`system.details.publication`) fuellt das Season-Modul bei
 * diesen schlanken NSCs nicht, bei seinen Kreaturen dagegen schon — auf
 * Entscheidung des Autors steht sie hier bei beiden.
 *
 * Diese Datei **schreibt nichts** und kennt Foundry nicht; der Verweis auf die
 * Journalseite entsteht erst in `apply.ts`, weil dort die Kennung des
 * Spielhilfen-Journals bekannt ist.
 */
import { vergleichsform, type PersonenBild } from './bilder.ts';

/** Das Blatt des PF2e-Systems fuer Personen ohne Werte. */
export const NSC_BLATT = 'pf2e.SimpleNPCSheet';

/** Eine Person mit Bild, aber ohne Statblock. */
export interface NscQuelle {
  /** Wortlaut der Bildunterschrift — er wird der Name des Actors. */
  name: string;
  /** Pfad des hochgeladenen Bildes. */
  bild: string;
  /** Dateiname ohne Endung; daraus haengt die Bildseite im Anhang. */
  file: string;
  /**
   * Die Quellenangabe des Hefts (`naming.ts::quellenangabe`).
   *
   * Fehlt sie, bleibt das Feld leer — wie bisher.
   */
  quelle?: string;
}

/**
 * Sucht die Personen heraus, aus denen ein NSC-Actor werden soll.
 *
 * Zwei Einschraenkungen, beide mit Grund:
 *
 * 1. **Nur Bilder aus dem Anhang.** Der Spielhilfen-Anhang ist die
 *    Personenliste des Hefts — dort steht je Person ein Bild mit Namen, und
 *    genau dorthin zeigt hinterher der Rueckverweis des Actors. Portraets im
 *    Fliesstext gehoeren zu ihrem Absatz, nicht zu einer eigenen Seite.
 * 2. **Wer einen Statblock hat, ist keiner.** Diese Personen entstehen bereits
 *    als Kreatur aus dem Kompendium; ein zweiter Actor waere eine Dublette.
 *    Verglichen wird auch gegen den Namen ohne `Elite`/`Weak`, weil der Actor
 *    wie der Statblock heisst und das Bild wie die Person.
 *
 * Gleiche Namen fallen zusammen; das erste Bild gewinnt.
 */
export function sammleNscs(bilder: PersonenBild[], kreaturNamen: string[]): NscQuelle[] {
  const vergeben = new Set(kreaturNamen.map((name) => vergleichsform(name)));
  for (const name of kreaturNamen) {
    vergeben.add(vergleichsform(name).replace(/^(?:elite|weak)\s+/, ''));
  }

  const gesehen = new Set<string>();
  const nscs: NscQuelle[] = [];

  for (const bild of bilder) {
    if (bild.anhang !== true || bild.file === undefined) continue;
    const schluessel = vergleichsform(bild.name);
    if (schluessel === '' || vergeben.has(schluessel) || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    nscs.push({ name: bild.name, bild: bild.pfad, file: bild.file });
  }

  return nscs;
}

/**
 * Die Actordaten einer solchen Person.
 *
 * Gesetzt wird nur, was das Season-7-Modul auch setzt. Die Merkmalszeile
 * (`system.details.blurb`, dort etwa „brash male undine scavenger") bleibt
 * leer: Sie steht im Heft nicht an einer Stelle, an der man sie sicher
 * erkennt, und geraten waere sie schlimmer als gar keine.
 */
export function baueNsc(quelle: NscQuelle): Record<string, unknown> {
  return {
    name: quelle.name,
    type: 'npc',
    img: quelle.bild,
    flags: { core: { sheetClass: NSC_BLATT } },
    system: {
      attributes: {
        hp: { value: 10, max: 10 },
        ac: { value: 10 },
        speed: { value: 25 },
      },
      details: {
        level: { value: 1 },
        blurb: '',
        publicNotes: '',
        // `null` ist im PF2e-System ausdruecklich **Neutral**. Fehlt das Feld,
        // gilt der Standard, und der ist bei einem `npc` „Gegenseite" — die
        // Person zaehlte dann beim Flankieren mit. Nachgelesen in
        // `actor/creature/config.ts`: `alliance === null ? 'neutral' : …`.
        alliance: null,
        publication: {
          title: quelle.quelle ?? '',
          authors: '',
          // Wie an den Kreaturen des Season-7-Moduls abgelesen: Die heutigen
          // Hefte erscheinen unter der ORC-Lizenz und sind Remaster-Produkte.
          license: 'ORC',
          remaster: true,
        },
      },
      traits: { value: [], rarity: 'unique', size: { value: 'med' } },
    },
    items: [],
  };
}

/**
 * Der Rueckverweis auf die Bildseite im Spielhilfen-Journal.
 *
 * Steht im PF2e-Blatt unter „GM Notes" und ist der Weg von der Person zu
 * ihrem Bild in Originalgroesse. Die Kennung des Journals ist erst beim
 * Schreiben bekannt — deshalb entsteht der Verweis nicht hier, sondern dort.
 */
export function nscNotiz(journalId: string, seitenId: string, name: string): string {
  return `<p>@UUID[JournalEntry.${journalId}.JournalEntryPage.${seitenId}]{${name}}</p>`;
}
