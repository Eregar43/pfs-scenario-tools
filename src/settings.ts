import { L } from './i18n.ts';
import { PfsEinstellungenApp } from './ui/einstellungen-app.ts';

export const MODULE_ID = 'pfs-scenario-tools';

export const SETTING_DIAGNOSE = 'diagnoseAusgabe';
export const SETTING_JOURNALNAME = 'journalNameSchema';
export const SETTING_ANREICHERN = 'anreichern';
export const SETTING_BILDWURZEL = 'bildWurzel';
export const SETTING_KREATURVERWEISE = 'kreaturVerweise';
export const SETTING_JOURNALDESIGN = 'journalDesign';
export const SETTING_ANGLEICHEN = 'statblockAngleichen';
export const SETTING_LESEBERICHT = 'lesebericht';
export const SETTING_NSCACTORS = 'nscActors';
export const SETTING_TOKENRINGE = 'tokenRinge';
export const SETTING_EFFEKTE = 'szenarioEffekte';
export const SETTING_WILLKOMMEN = 'willkommenGezeigt';
const MENU_BILDWURZEL = 'bildwurzelMenu';

/**
 * Registriert eine Einstellung und ueberlebt eine zweite Registrierung.
 *
 * Beim Entwickeln wird das Modul im laufenden Foundry neu geladen; ein
 * zweiter `register`-Aufruf wirft dann. Das darf den `init`-Hook nicht
 * abbrechen, sonst faellt das ganze Modul aus.
 */
function registriere(key: string, data: Record<string, unknown>): void {
  try {
    game.settings.register(MODULE_ID, key, data);
  } catch {
    // Schon registriert (Neuladen im laufenden Betrieb) — nichts zu tun.
  }
}

/** Wie `registriere`, nur fuer `registerMenu` — derselbe Neulade-Fall. */
function registriereMenu(key: string, data: Record<string, unknown>): void {
  try {
    game.settings.registerMenu(MODULE_ID, key, data);
  } catch {
    // Schon registriert (Neuladen im laufenden Betrieb) — nichts zu tun.
  }
}

/**
 * Die Einstellungen wachsen mit den Etappen: Ablagepfade, Anreicherung,
 * Szenen und Kreaturen kommen dazu, sobald es die Funktion dazu gibt. Ein
 * eigenes Einstellungsfenster folgt — Foundry kann in der normalen
 * Einstellungsliste keinen Verzeichnis-Waehler zeigen (`SettingConfig` hat
 * kein Feld dafuer, und `input` ist seit v13 funktionslos).
 */
export function registriereEinstellungen(): void {
  registriere(SETTING_JOURNALNAME, {
    name: L('Einstellungen.Journalname.Name'),
    hint: L('Einstellungen.Journalname.Hinweis'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      kurz: L('Einstellungen.Journalname.Kurz'),
      pfs: L('Einstellungen.Journalname.Pfs'),
    },
    default: 'kurz',
  });

  registriere(SETTING_JOURNALDESIGN, {
    name: L('Einstellungen.Journaldesign.Name'),
    hint: L('Einstellungen.Journaldesign.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  registriere(SETTING_ANGLEICHEN, {
    name: L('Einstellungen.Angleichen.Name'),
    hint: L('Einstellungen.Angleichen.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  // `client`, nicht `world`: Das ist eine Anzeigevorliebe des einzelnen
  // Benutzers und aendert nichts an dem, was in der Welt landet. Alle uebrigen
  // Einstellungen des Moduls tun genau das und sind deshalb weltweit.
  registriere(SETTING_LESEBERICHT, {
    name: L('Einstellungen.Lesebericht.Name'),
    hint: L('Einstellungen.Lesebericht.Hinweis'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });

  registriere(SETTING_ANREICHERN, {
    name: L('Einstellungen.Anreichern.Name'),
    hint: L('Einstellungen.Anreichern.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  registriere(SETTING_NSCACTORS, {
    name: L('Einstellungen.NscActors.Name'),
    hint: L('Einstellungen.NscActors.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  registriere(SETTING_TOKENRINGE, {
    name: L('Einstellungen.TokenRinge.Name'),
    hint: L('Einstellungen.TokenRinge.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  registriere(SETTING_EFFEKTE, {
    name: L('Einstellungen.Effekte.Name'),
    hint: L('Einstellungen.Effekte.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  registriere(SETTING_KREATURVERWEISE, {
    name: L('Einstellungen.Kreaturverweise.Name'),
    hint: L('Einstellungen.Kreaturverweise.Hinweis'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      kompendium: L('Einstellungen.Kreaturverweise.Kompendium'),
      welt: L('Einstellungen.Kreaturverweise.Welt'),
    },
    default: 'kompendium',
  });

  registriere(SETTING_DIAGNOSE, {
    name: L('Einstellungen.Diagnose.Name'),
    hint: L('Einstellungen.Diagnose.Hinweis'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // config: false — dieser Wert wird nicht in der normalen Liste angezeigt,
  // sondern ueber das Menu unten und dessen Verzeichnis-Waehler gesetzt.
  registriere(SETTING_BILDWURZEL, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  // Ebenfalls `config: false` — das ist kein Schalter, sondern ein Merkzettel:
  // Hier steht die Modulversion, deren Begruessung der Spielleiter gesehen
  // hat, und leer heisst „noch nie gezeigt".
  registriere(SETTING_WILLKOMMEN, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  registriereMenu(MENU_BILDWURZEL, {
    name: L('Einstellungen.Bildwurzel.MenuName'),
    label: L('Einstellungen.Bildwurzel.MenuLabel'),
    hint: L('Einstellungen.Bildwurzel.MenuHinweis'),
    icon: 'fa-solid fa-folder-open',
    type: PfsEinstellungenApp,
    restricted: true,
  });
}

/** Wurzelverzeichnis fuer Bilder, leer solange niemand eins gewaehlt hat. */
export function bildWurzel(): string {
  return String(game.settings.get(MODULE_ID, SETTING_BILDWURZEL) ?? '');
}

/**
 * Modulversion, deren Begruessung gezeigt wurde — leer, solange keine war.
 */
export function willkommenGezeigt(): string {
  return String(game.settings.get(MODULE_ID, SETTING_WILLKOMMEN) ?? '');
}

/** Haelt fest, dass die Begruessung dieser Version gezeigt wurde. */
export async function merkeWillkommen(version: string): Promise<void> {
  await game.settings.set(MODULE_ID, SETTING_WILLKOMMEN, version);
}

/** Wie das Journal in der Seitenleiste heissen soll. */
export function journalNameSchema(): 'kurz' | 'pfs' {
  return game.settings.get(MODULE_ID, SETTING_JOURNALNAME) === 'pfs' ? 'pfs' : 'kurz';
}

/** Sollen neue Journale das eigene Journal-Blatt des Moduls bekommen? */
export function journalDesignAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_JOURNALDESIGN) !== false;
}

/**
 * Soll die Kompendium-Kopie an den abgedruckten Statblock angeglichen werden?
 *
 * Aus ist die Kopie das, was das Kompendium fuehrt — die Abweichungen stehen
 * dann weiterhin in der Vorschau, werden aber nicht geschrieben.
 */
export function angleichenAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_ANGLEICHEN) !== false;
}

/**
 * Soll der Lesebericht als Dialog erscheinen?
 *
 * In die Konsole geschrieben wird er immer — die Einstellung entscheidet nur
 * ueber das Fenster. Aus heisst: Nach dem Lesen geht es direkt zur Vorschau.
 */
export function leseberichtAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_LESEBERICHT) === true;
}

/**
 * Sollen Personen mit Bild, aber ohne Statblock zu Actors werden?
 *
 * Aus bleiben sie ein Bild im Spielhilfen-Journal — so war es frueher.
 */
export function nscActorsAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_NSCACTORS) !== false;
}

/**
 * Sollen Actors mit Portraet einen dynamischen Token-Ring bekommen?
 *
 * Aus wird das Portraet trotzdem das Token — der Ring ist die Verzierung,
 * der Bildtausch der Zweck. Gefahren bekommen nie einen Ring.
 */
export function tokenRingeAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_TOKENRINGE) !== false;
}

/**
 * Sollen die Zusagen des Hefts als Effekt-Gegenstaende entstehen?
 *
 * Gemeint sind Saetze wie „alle SC erhalten +1 auf Initiative im Kampf gegen
 * den Kapitaen". Aus bleiben sie blosser Text im Journal.
 */
export function effekteAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_EFFEKTE) !== false;
}

/** Sollen Verweise auf Kompendien gesetzt werden? */
export function anreichernAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_ANREICHERN) !== false;
}

/** Wohin Kreaturverweise zeigen: Kompendium oder die Welt-Actors. */
export function kreaturVerweise(): 'kompendium' | 'welt' {
  return game.settings.get(MODULE_ID, SETTING_KREATURVERWEISE) === 'welt' ? 'welt' : 'kompendium';
}

/** Ausfuehrliche Protokollausgabe eingeschaltet? */
export function diagnoseAn(): boolean {
  return game.settings.get(MODULE_ID, SETTING_DIAGNOSE) === true;
}
