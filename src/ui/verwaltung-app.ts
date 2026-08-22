import { L } from '../i18n.ts';
import { bildWurzel } from '../settings.ts';
import {
  befund,
  bestandAus,
  type SzenarioBestand,
  type Teil,
  type Teilbefund,
  type Zustand,
} from '../world/bestand.ts';
import { szenarioBildOrdner } from '../world/bilder.ts';
import { zaehleDateien } from '../world/files.ts';
import { weltabbild } from '../world/journal.ts';
import { zeigeImportDialog } from './import-dialog.ts';
import { bestaetigeUndEntferne } from './uebersicht-dialog.ts';
import { zeigeWillkommen } from './willkommen-dialog.ts';

/**
 * Das Verwaltungsfenster des Moduls — **ein** Knopf in der Seitenleiste, ein
 * Fenster, alles darin.
 *
 * Vorher waren es zwei Knoepfe (Importieren und Uebersicht), und die
 * Uebersicht war ein `DialogV2`. Ein Dialog ist aber eine Frage mit Antwort:
 * Er geht nach jedem Griff zu, und wer zwei Szenarien nacheinander entfernen
 * will, muss ihn zweimal aufmachen. Ein Fenster bleibt stehen und zeichnet
 * sich nach jeder Aenderung neu — das ist der eigentliche Grund fuer den
 * Wechsel auf `ApplicationV2`, nicht die Optik.
 *
 * Imperativ gebautes DOM wie ueberall im Modul, kein Handlebars.
 */
export class PfsVerwaltungApp extends foundry.applications.api.ApplicationV2 {
  // Der Titel steht als **roher Schluessel** da, nicht als L(...): Dieser
  // Initialisierer laeuft beim Laden des Bundles, lange vor `init`.
  // ApplicationV2 uebersetzt `window.title` selbst beim Anzeigen.
  static override DEFAULT_OPTIONS: Record<string, unknown> = {
    id: 'pfs-scenario-tools-verwaltung',
    window: {
      title: 'PFSST.Uebersicht.Titel',
      icon: 'fa-solid fa-list-check',
      // Von Hand veraenderbar: Bei einem langen Szenariotitel oder einer
      // anderen Schriftgroesse bleibt die Zeile sonst zu eng, und niemand
      // koennte etwas dagegen tun.
      resizable: true,
    },
    // 760 statt 560: Die fuenf Teile der Vollstaendigkeitsprobe sollen in
    // **eine** Zeile passen. Gerechnet ist mit der deutschen Fassung, sie ist
    // die laengere — `Journalseiten 16/16  Spielhilfen 5/5  Szenen 2/2
    // Actors 8/8  Bilder 12/12` misst rund 640 Bildpunkte, dazu Haekchen,
    // Innenabstand und Rand.
    position: { width: 760 },
    actions: {
      importieren: PfsVerwaltungApp.#importieren,
      entfernen: PfsVerwaltungApp.#entfernen,
      hilfe: PfsVerwaltungApp.#hilfe,
      schliessen: PfsVerwaltungApp.#schliessen,
    },
  };

  /** Der Weltbestand des letzten Zeichnens — die Griffe rechnen damit. */
  #bestaende: SzenarioBestand[] = [];

  protected override async _renderHTML(): Promise<HTMLElement> {
    // Bei jedem Zeichnen frisch aus der Welt gelesen. Das Fenster bleibt
    // offen, waehrend importiert und entfernt wird; ein einmal gemerkter
    // Bestand waere nach dem ersten Griff falsch.
    this.#bestaende = bestandAus(weltabbild());

    // Die Bilddateien liegen im Datenbaum, nicht in der Welt — als einziger
    // Bestandteil muessen sie nachgesehen werden. Das kostet je Szenario eine
    // Anfrage, deshalb alle auf einmal.
    const wurzel = bildWurzel().replace(/\/+$/, '');
    const bilder = new Map<string, number | undefined>(
      await Promise.all(
        this.#bestaende.map(
          async (bestand): Promise<[string, number | undefined]> => [
            bestand.schluessel,
            wurzel === ''
              ? undefined
              : await zaehleDateien(`${wurzel}/${szenarioBildOrdner(bestand.schluessel)}`),
          ],
        ),
      ),
    );

    const inhalt = document.createElement('div');
    inhalt.append(
      this.#bestaende.length === 0 ? leereListe() : baueListe(this.#bestaende, bilder),
    );
    inhalt.append(baueFussleiste(this.#bestaende.length > 0));
    return inhalt;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /** Die angekreuzten Szenarien, in der Reihenfolge der Liste. */
  #gewaehlte(): SzenarioBestand[] {
    const angekreuzt = new Set(
      Array.from(
        this.element.querySelectorAll<HTMLInputElement>('input[name="schluessel"]:checked'),
        (feld) => feld.value,
      ),
    );
    return this.#bestaende.filter((bestand) => angekreuzt.has(bestand.schluessel));
  }

  static async #importieren(this: PfsVerwaltungApp): Promise<void> {
    // Das Fenster bleibt offen und zeichnet sich danach neu — so steht das
    // frisch importierte Szenario sofort in der Liste.
    await zeigeImportDialog();
    await this.render();
  }

  static async #entfernen(this: PfsVerwaltungApp): Promise<void> {
    const gewaehlte = this.#gewaehlte();
    if (gewaehlte.length === 0) {
      // Stilles Nichtstun saehe aus wie ein Fehler.
      ui.notifications?.warn(L('Uebersicht.NichtsGewaehlt'));
      return;
    }

    await bestaetigeUndEntferne(gewaehlte);
    await this.render();
  }

  /**
   * Die Begruessung noch einmal.
   *
   * Sie erscheint von selbst nur beim ersten Start einer Welt. Ohne diesen
   * Knopf waere sie danach unerreichbar — samt dem Weg zum Bildordner.
   */
  static async #hilfe(this: PfsVerwaltungApp): Promise<void> {
    await zeigeWillkommen();
    // Ein neu gewaehlter Bildordner aendert die Zahl der gefundenen Bilder.
    await this.render();
  }

  static async #schliessen(this: PfsVerwaltungApp): Promise<void> {
    await this.close();
  }
}

/** Name des Bestandteils — als Schalter, damit `tools/pruefe.mjs` mitliest. */
function teilName(teil: Teil): string {
  switch (teil) {
    case 'journal':
      return L('Verwaltung.Teil.Journal');
    case 'anhang':
      return L('Verwaltung.Teil.Anhang');
    case 'szenen':
      return L('Verwaltung.Teil.Szenen');
    case 'aktoren':
      return L('Verwaltung.Teil.Aktoren');
    case 'effekte':
      return L('Verwaltung.Teil.Effekte');
    case 'bilder':
      return L('Verwaltung.Teil.Bilder');
  }
}

/** Symbol und Farbe je Zustand — Foundrys eigene Meldungsfarben. */
const AMPEL: Record<Zustand, { symbol: string; farbe: string }> = {
  vollstaendig: { symbol: 'fa-circle-check', farbe: 'var(--color-level-success, #0b8a3a)' },
  unvollstaendig: { symbol: 'fa-triangle-exclamation', farbe: 'var(--color-level-warning, #c07000)' },
  fehlt: { symbol: 'fa-circle-xmark', farbe: 'var(--color-level-error, #a01010)' },
  unbekannt: { symbol: 'fa-circle-question', farbe: 'var(--color-text-subtle, #888)' },
};

/**
 * Eine Zeile der Vollstaendigkeitsprobe: Symbol, Name, Zahlen.
 *
 * Bei `unbekannt` steht bewusst keine Soll-Zahl da — sie zu erfinden waere
 * schlimmer, als die Luecke zu zeigen.
 */
function baueBefundZeile(zeile: Teilbefund): HTMLElement {
  const eintrag = document.createElement('span');
  eintrag.style.display = 'inline-flex';
  eintrag.style.alignItems = 'baseline';
  eintrag.style.gap = '0.25rem';
  eintrag.style.marginRight = '0.75rem';
  eintrag.style.whiteSpace = 'nowrap';

  const ampel = AMPEL[zeile.zustand];
  const symbol = document.createElement('i');
  symbol.className = `fa-solid ${ampel.symbol}`;
  symbol.style.color = ampel.farbe;

  const text = document.createElement('span');
  text.textContent =
    zeile.zustand === 'unbekannt'
      ? L('Verwaltung.ZahlUnbekannt', { teil: teilName(zeile.teil), ist: zeile.ist })
      : L('Verwaltung.Zahl', {
          teil: teilName(zeile.teil),
          ist: zeile.ist,
          soll: zeile.soll ?? zeile.ist,
        });

  eintrag.append(symbol, text);
  return eintrag;
}

/** Die Vollstaendigkeitsprobe eines Szenarios als Zeile aus Plaketten. */
function baueBefund(bestand: SzenarioBestand, bilderIst: number | undefined): HTMLElement {
  const zeile = document.createElement('div');
  zeile.className = 'notes';
  for (const teil of befund(bestand, bilderIst)) zeile.append(baueBefundZeile(teil));
  return zeile;
}

function leereListe(): HTMLElement {
  const hinweis = document.createElement('p');
  hinweis.className = 'notes';
  hinweis.textContent = L('Uebersicht.Leer');
  return hinweis;
}

function baueListe(
  bestaende: SzenarioBestand[],
  bilder: Map<string, number | undefined>,
): HTMLElement {
  const liste = document.createElement('div');

  for (const bestand of bestaende) {
    // Kein `.form-group`: Foundrys Klasse verteilt die Kinder ueber die
    // volle Breite — der Auswahlknopf saesse dann weit ab vom Text.
    const zeile = document.createElement('label');
    zeile.style.display = 'flex';
    zeile.style.gap = '0.5rem';
    zeile.style.alignItems = 'baseline';
    zeile.style.marginBottom = '0.5rem';

    // Haekchen statt Auswahlpunkt: es duerfen mehrere Szenarien auf einmal
    // entfernt werden. Ohne Vorauswahl — wer loeschen will, soll ankreuzen.
    const auswahl = document.createElement('input');
    auswahl.type = 'checkbox';
    auswahl.name = 'schluessel';
    auswahl.value = bestand.schluessel;
    auswahl.style.flex = '0 0 auto';

    const text = document.createElement('div');
    text.style.flex = '1';
    const titel = document.createElement('strong');
    titel.textContent = bestand.journal?.name ?? bestand.schluessel;
    const herkunft = document.createElement('p');
    herkunft.className = 'notes';
    herkunft.style.margin = '0';
    herkunft.textContent = bestand.importedAt
      ? L('Uebersicht.Importiert', {
          datum: new Date(bestand.importedAt).toLocaleString(),
          hash: bestand.sourceHash ?? '?',
        })
      : '';

    text.append(titel, baueBefund(bestand, bilder.get(bestand.schluessel)), herkunft);

    // Der Alters-Hinweis beantwortet die Frage „lohnt ein Neuimport?", ohne
    // dass jemand den Changelog aufschlagen muss.
    const jetzt = game.modules.get('pfs-scenario-tools')?.version;
    if (bestand.toolVersion && jetzt && bestand.toolVersion !== jetzt) {
      const alt = document.createElement('p');
      alt.className = 'notes';
      alt.style.margin = '0';
      alt.textContent = L('Verwaltung.Veraltet', { alt: bestand.toolVersion, neu: jetzt });
      text.append(alt);
    }

    zeile.append(auswahl, text);
    liste.append(zeile);
  }

  return liste;
}

/**
 * Die Knopfleiste am Fuss.
 *
 * `Entfernen` ist nur da, wenn es ueberhaupt etwas zu entfernen gibt —
 * ein Knopf, der immer meckert, erzieht niemanden.
 */
function baueFussleiste(mitEntfernen: boolean): HTMLElement {
  const leiste = document.createElement('footer');
  leiste.className = 'form-footer';
  leiste.style.display = 'flex';
  leiste.style.gap = '0.5rem';
  leiste.style.marginTop = '0.75rem';

  // Die Beschriftung kommt **fertig uebersetzt** herein, nicht als
  // Schluessel: Ein ueber eine Variable gebauter `L`-Aufruf ist fuer
  // `tools/pruefe.mjs` unsichtbar, und genau so ist schon einmal eine halb
  // deutsche Oberflaeche durchgerutscht.
  const knopf = (
    aktion: string,
    beschriftung: string,
    symbol: string,
    standard = false,
  ): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.dataset.action = aktion;
    if (standard) element.className = 'default';
    element.innerHTML = `<i class="fa-solid ${symbol}"></i> ${beschriftung}`;
    return element;
  };

  leiste.append(knopf('importieren', L('Import.Knopf'), 'fa-file-import', true));
  if (mitEntfernen) leiste.append(knopf('entfernen', L('Uebersicht.Entfernen'), 'fa-trash'));
  leiste.append(knopf('hilfe', L('Uebersicht.Hilfe'), 'fa-circle-question'));
  leiste.append(knopf('schliessen', L('Uebersicht.Schliessen'), 'fa-xmark'));

  return leiste;
}
