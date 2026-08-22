/**
 * Entfernt ein importiertes Szenario aus der Welt — Journal, Spielhilfen,
 * Szenen, Kreaturen, Effekte und die eigenen Szenario-Ordner, in einem Zug.
 *
 * Geloescht wird ausschliesslich, was im `SzenarioBestand` steht, also am
 * eigenen Flag erkannt wurde. Einzige Ausnahme ist der **Season-Ordner
 * darueber**: Er faellt, wenn nach dem Zug nichts mehr darin steht
 * (`verwaisteSeasonOrdner` in `bestand.ts` entscheidet das, bevor etwas
 * passiert — die Bestaetigung nennt ihn deshalb schon). Steht dort noch ein
 * anderes Szenario oder etwas Eigenes des Spielleiters, bleibt er.
 *
 * Die **Bilddateien bleiben liegen**: Foundrys Client-API kann Dateien nur
 * anlegen, nicht loeschen; der Dialog nennt den Ordner fuer den Griff zum
 * Dateibrowser.
 */
import type { OrdnerTreffer, SzenarioBestand } from './bestand.ts';

export interface Entfernt {
  journale: number;
  szenen: number;
  aktoren: number;
  effekte: number;
  ordner: number;
}

export async function entferneSzenario(bestand: SzenarioBestand): Promise<Entfernt> {
  const journalIds = [bestand.journal?.id, bestand.anhang?.id].filter(
    (id): id is string => id !== undefined,
  );

  // Erst die Inhalte, dann die Ordner: ein leerer Ordner verschwindet sauber,
  // ein voller wuerde seine Reste zum Elternordner hochschieben.
  if (journalIds.length > 0) await JournalEntry.deleteDocuments(journalIds);
  if (bestand.szenen.length > 0) {
    await Scene.deleteDocuments(bestand.szenen.map((szene) => szene.id));
  }
  if (bestand.aktoren.length > 0) {
    await Actor.deleteDocuments(bestand.aktoren.map((aktor) => aktor.id));
  }
  if (bestand.effekte.length > 0) {
    await Item.deleteDocuments(bestand.effekte.map((effekt) => effekt.id));
  }
  if (bestand.ordner.length > 0) {
    await Folder.deleteDocuments(bestand.ordner.map((ordner) => ordner.id));
  }

  return {
    journale: journalIds.length,
    szenen: bestand.szenen.length,
    aktoren: bestand.aktoren.length,
    effekte: bestand.effekte.length,
    ordner: bestand.ordner.length,
  };
}

/**
 * Raeumt die leer gewordenen Season-Ordner ab.
 *
 * Getrennt vom Szenario, weil ein Season-Ordner mehreren Szenarien gehoert:
 * Er darf erst fallen, wenn **alle** gewaehlten Szenarien draussen sind.
 * Welche das sind, hat `verwaisteSeasonOrdner` vor dem ersten Griff
 * entschieden.
 */
export async function entferneOrdner(ordner: OrdnerTreffer[]): Promise<number> {
  if (ordner.length === 0) return 0;
  await Folder.deleteDocuments(ordner.map((eintrag) => eintrag.id));
  return ordner.length;
}
