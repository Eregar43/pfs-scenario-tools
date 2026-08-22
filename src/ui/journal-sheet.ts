import { L } from '../i18n.ts';
import { MODULE_ID } from '../settings.ts';
import { abgedunkelt, aufgehellt, defaultColorFor } from '../world/colors.ts';
import { lies } from '../world/flags.ts';

/**
 * Ein Journal-Blatt, das sich vom Foundry-Standard nur um eine CSS-Klasse
 * und zwei Farbvariablen unterscheidet. Alles Gestaltete steht in
 * `styles/journal.css`, eingegrenzt auf `.pfs-journal` — ein Journal mit dem
 * Standard-Blatt zeigt denselben Inhalt, nur schlichter. So bleibt das Blatt
 * jederzeit abwaehlbar, und die Journale funktionieren auch ohne dieses
 * Modul weiter.
 */
class PfsJournalSheet extends foundry.applications.sheets.journal.JournalEntrySheet {
  static override DEFAULT_OPTIONS = { classes: ['pfs-journal'] };

  /**
   * Faerbt das Blatt in der Hausfarbe seines Jahrgangs — derselben Farbe,
   * die der Season-Ordner in der Seitenleiste traegt. Der Jahrgang steht in
   * den eigenen Flags; ein Journal ohne Stempel (von Hand umgestelltes
   * Fremdjournal) behaelt die Werte aus dem Stylesheet.
   *
   * Gesetzt wird am Fenster, nicht im Stylesheet: Die Farbe haengt am
   * Dokument, und ein Stylesheet kann nicht je Journal etwas anderes sagen.
   */
  protected override async _onRender(
    context: Record<string, unknown>,
    optionen: Record<string, unknown>,
  ): Promise<void> {
    await super._onRender(context, optionen);

    const season = lies(this.document).season;
    if (typeof season !== 'number') return;

    const farbe = defaultColorFor(season);
    this.element.style.setProperty('--pfs-season', farbe);
    this.element.style.setProperty('--pfs-season-hell', aufgehellt(farbe));
    this.element.style.setProperty('--pfs-season-dunkel', abgedunkelt(farbe));
  }
}

/**
 * Wert fuer `flags.core.sheetClass` — so verweist ein einzelnes Journal auf
 * dieses Blatt. Muss `<modul>.<Klassenname>` lauten, denn genau so bildet
 * Foundry die Kennung beim Registrieren.
 */
export const SHEET_CLASS = `${MODULE_ID}.${PfsJournalSheet.name}`;

/** Traegt das Blatt in den Auswahl-Dialog ein; uebersteht ein Neuladen. */
export function registrierePfsJournalSheet(): void {
  try {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(
      JournalEntry,
      MODULE_ID,
      PfsJournalSheet,
      // Als Funktion, nicht als Wert: Zum `init`-Zeitpunkt sind die
      // Sprachdateien noch nicht geladen.
      { label: () => L('JournalSheet.Name') },
    );
  } catch {
    // Schon registriert (Neuladen im laufenden Betrieb) — nichts zu tun.
  }
}
