import { L } from './i18n.ts';
import { fasseZusammen, szenarioAusDatei } from './lesen.ts';
import { MODULE_ID, diagnoseAn, registriereEinstellungen } from './settings.ts';
import { zeigeImportDialog } from './ui/import-dialog.ts';
import { zeigeKartenExport } from './ui/karten-export-app.ts';
import { registrierePfsJournalSheet } from './ui/journal-sheet.ts';
import { PfsVerwaltungApp } from './ui/verwaltung-app.ts';
import { zeigeWillkommen, zeigeWillkommenWennNeu } from './ui/willkommen-dialog.ts';

/**
 * Einstiegspunkt des Moduls.
 *
 * Diese Datei bleibt reine Verdrahtung: Hooks anmelden, Einstellungen
 * registrieren, die oeffentliche Schnittstelle bereitstellen. Fachlogik
 * gehoert nach `src/pdf/` (PDF lesen) und `src/world/` (in die Welt
 * schreiben); die beiden Haelften kennen einander nur ueber den Typ
 * `Scenario`.
 */

/**
 * Oeffnet das Verwaltungsfenster.
 *
 * Genau **eine** Fassung davon, ueber die ganze Sitzung: Ein zweiter Klick
 * holt das offene Fenster nach vorn, statt ein zweites danebenzustellen.
 * ApplicationV2 fuehrt seine Fenster ueber die Kennung aus `DEFAULT_OPTIONS`,
 * und zwei Fenster mit derselben Kennung vertragen sich nicht.
 */
let verwaltung: PfsVerwaltungApp | undefined;

async function zeigeVerwaltung(): Promise<void> {
  verwaltung ??= new PfsVerwaltungApp();
  await verwaltung.render({ force: true });
}

function version(): string {
  return game.modules.get(MODULE_ID)?.version ?? '0.0.0';
}

/**
 * Was das Modul nach aussen anbietet — sowohl unter
 * `game.modules.get("pfs-scenario-tools").api` (der von Foundry vorgesehene
 * Weg) als auch unter `game.pfsScenarioTools` (bequem in der Konsole).
 */
function baueApi(): PfsScenarioToolsApi {
  return {
    moduleId: MODULE_ID,
    get version() {
      return version();
    },
    importieren: zeigeImportDialog,
    // Der Name bleibt `uebersicht` — er steht seit der ersten Ausgabe in der Konsole und
    // in der Doku; das Fenster dahinter ist nur ein anderes geworden.
    uebersicht: zeigeVerwaltung,
    // Der Weg fuer den Fall, dass noch kein Szenario importiert ist: Dann
    // zeigt das Verwaltungsfenster den Knopf nicht, das Fenster selbst
    // erklaert sich aber auch leer.
    karteExportieren: zeigeKartenExport,
    willkommen: zeigeWillkommen,
    szenarioAusDatei,
    fasseZusammen,
  };
}

Hooks.once('init', () => {
  registriereEinstellungen();
  registrierePfsJournalSheet();

  const api = baueApi();
  const modul = game.modules.get(MODULE_ID);
  if (modul) modul.api = api;
  // An `game`, nicht an `globalThis`: so macht es showstopping_tools, und in
  // der Konsole tippt man ohnehin `game.` — `window.` faellt niemandem ein.
  game.pfsScenarioTools = api;
});

/**
 * Der Knopf am Fuss der Journal-Seitenleiste — **einer**, nicht zwei.
 *
 * Frueher standen dort `Importieren` und `Uebersicht` nebeneinander. Beide
 * fuehrten in dieselbe Arbeit, und die Seitenleiste ist schmal; seither gibt
 * es einen Knopf, der das Verwaltungsfenster oeffnet, und darin steht auch
 * der Import.
 *
 * Nur fuer Spielleiter — der Import legt Ordner und Journale an und laedt
 * Dateien hoch, das steht Spielern nicht zu. Der Hook feuert bei jedem
 * Neuzeichnen der Seitenleiste; die Klassenpruefung verhindert, dass sich
 * der Knopf dabei vermehrt.
 */
Hooks.on('renderJournalDirectory', (_app: unknown, html: HTMLElement) => {
  if (!game.user?.isGM) return;
  if (html.querySelector('.pfs-scenario-tools-verwaltung')) return;

  const fuss = html.querySelector('.directory-footer.action-buttons');
  if (!fuss) return;

  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'pfs-scenario-tools-verwaltung';
  knopf.innerHTML = `<i class="fa-solid fa-list-check"></i> ${L('Uebersicht.Knopf')}`;
  knopf.addEventListener('click', () => void zeigeVerwaltung());

  fuss.append(knopf);
});

Hooks.once('ready', () => {
  if (diagnoseAn()) {
    console.log(`${MODULE_ID} | bereit, Version ${version()}`);
  }

  // Nur fuer Spielleiter: Alles, wovon die Begruessung handelt — der Import
  // und der Bildordner — steht Spielern ohnehin nicht offen.
  if (game.user?.isGM) void zeigeWillkommenWennNeu();
});
