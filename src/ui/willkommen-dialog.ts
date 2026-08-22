import { L } from '../i18n.ts';
import { MODULE_ID, bildWurzel, merkeWillkommen, willkommenGezeigt } from '../settings.ts';
import { PfsEinstellungenApp } from './einstellungen-app.ts';

/**
 * Das Begruessungsfenster — einmal je Welt, danach nur noch auf Zuruf.
 *
 * Es beantwortet die zwei Fragen, die ein frisch installiertes Modul offen
 * laesst: **Wo ist der Knopf?** und **was muss ich vorher einstellen?** Die
 * zweite ist die wichtigere: Ohne Bildordner entsteht beim Import nur das
 * Journal — keine Bilder, keine Szenen, keine Portraets an den Actors. Das
 * faellt sonst erst nach dem ersten Lauf auf, und dann sieht es wie ein
 * Fehler aus.
 *
 * Nur fuer Spielleiter, wie der Import selbst: Der Bildordner ist eine
 * Welt-Einstellung, ein Spieler koennte sie gar nicht setzen.
 */

/** Absatz mit Fliesstext, auf Wunsch als Randbemerkung. */
function absatz(text: string, leise = false): HTMLElement {
  const element = document.createElement('p');
  if (leise) element.className = 'notes';
  element.textContent = text;
  return element;
}

/** Die drei Schritte bis zum ersten Import, als nummerierte Liste. */
function baueSchritte(): HTMLElement {
  const liste = document.createElement('ol');
  liste.style.margin = '0 0 0.75rem';
  liste.style.paddingLeft = '1.5rem';
  for (const text of [
    L('Willkommen.SchrittSeitenleiste'),
    L('Willkommen.SchrittKnopf', { knopf: L('Uebersicht.Knopf') }),
    L('Willkommen.SchrittImport', { knopf: L('Import.Knopf') }),
  ]) {
    const zeile = document.createElement('li');
    zeile.textContent = text;
    liste.append(zeile);
  }
  return liste;
}

/**
 * Der Hinweis auf den Bildordner — als Warnung, solange keiner gewaehlt ist,
 * sonst als Bestaetigung mit dem gewaehlten Pfad.
 *
 * Die zweite Fassung ist kein Beiwerk: Wer das Fenster spaeter noch einmal
 * aufruft, soll daran ablesen koennen, dass alles steht.
 */
function baueBildordnerHinweis(wurzel: string): HTMLElement {
  const kasten = document.createElement('p');
  kasten.className = wurzel === '' ? 'notification warning' : 'notification info';
  kasten.textContent =
    wurzel === ''
      ? L('Willkommen.BildordnerFehlt')
      : L('Willkommen.BildordnerSteht', { pfad: wurzel });
  return kasten;
}

/**
 * Baut den Inhalt des Fensters.
 *
 * Der Bildordner steht **vor** den Schritten, nicht dahinter: Er ist keine
 * Fussnote zum Import, sondern seine Voraussetzung. Wer erst die Schritte
 * liest, hat schon angefangen, bevor er von ihm erfaehrt.
 */
function baueInhalt(wurzel: string): HTMLElement {
  const inhalt = document.createElement('div');
  inhalt.append(
    absatz(L('Willkommen.Einleitung')),
    absatz(L('Willkommen.Umfang'), true),
    baueBildordnerHinweis(wurzel),
    absatz(L('Willkommen.WoEinstellung')),
    absatz(L('Willkommen.SchritteTitel')),
    baueSchritte(),
    absatz(L('Willkommen.Wiederholen'), true),
  );
  return inhalt;
}

/**
 * Zeigt das Fenster und oeffnet auf Wunsch gleich den Ordner-Waehler.
 *
 * Der Weg zum Waehler ist ein Knopf im Fenster und nicht bloss eine
 * Wegbeschreibung: Zwischen „verstanden" und „getan" faellt sonst genau die
 * Einstellung aus, um die es hier geht.
 */
export async function zeigeWillkommen(): Promise<void> {
  const wurzel = bildWurzel();

  const antwort = await foundry.applications.api.DialogV2.wait({
    window: { title: L('Willkommen.Titel'), icon: 'fa-solid fa-book-open' },
    position: { width: 560 },
    content: baueInhalt(wurzel),
    buttons: [
      {
        action: 'ordner',
        label: L('Willkommen.BildordnerWaehlen'),
        icon: 'fa-solid fa-folder-open',
        default: wurzel === '',
      },
      {
        action: 'fertig',
        label: L('Willkommen.Verstanden'),
        icon: 'fa-solid fa-check',
        default: wurzel !== '',
      },
    ],
    rejectClose: false,
  });

  if (antwort === 'ordner') await new PfsEinstellungenApp().render({ force: true });
}

/**
 * Zeigt das Fenster beim ersten Start in dieser Welt.
 *
 * Gemerkt wird die **Version**, nicht ein blosses Ja: Damit liesse sich
 * spaeter ein Hinweis auf Neuerungen anhaengen, ohne dass jemand raten muss,
 * welchen Stand der Spielleiter zuletzt gesehen hat.
 *
 * Gemerkt wird erst **nach** dem Schliessen. Wer das Fenster stehen laesst
 * und neu laedt, bekommt es wieder — das ist gewollt.
 */
export async function zeigeWillkommenWennNeu(): Promise<void> {
  if (willkommenGezeigt() !== '') return;

  await zeigeWillkommen();
  await merkeWillkommen(game.modules.get(MODULE_ID)?.version ?? '0.0.0');
}
