import { L } from '../i18n.ts';
import { lies } from '../world/flags.ts';
import { kartenEinstellung } from '../world/karten-einstellungen.ts';
import {
  type Kartenmasse,
  type Quelltextzeilen,
  type Wandauszug,
  kartenkennungAusPfad,
  quelltextzeilen,
  skalierungAus,
  wandauszug,
  wanddateiText,
} from '../world/kartenexport.ts';
import { kartenWaende, wandSignaturen } from '../world/waende.ts';

/**
 * Das Fenster „Karte exportieren": Szenario und Szene waehlen, die Messwerte
 * und Waende der Szene ablesen, als Wanddatei herunterladen und die Zeilen
 * zeigen, die der Quelltext dazu braucht.
 *
 * Es ersetzt `tools/exportiere-waende.mjs` fuer den Normalfall. Das Werkzeug
 * bleibt: Es kommt ohne laufendes Foundry aus, dieses Fenster nicht.
 *
 * **`ApplicationV2`, nicht `DialogV2`** — und nicht wegen der Optik: Die
 * Szenen-Auswahl haengt von der Szenario-Auswahl ab, also muss sich der
 * Inhalt nach einem Griff neu zeichnen. Ein Dialog klont seinen Inhalt und
 * geht nach jedem Knopf zu; ein Fenster bleibt stehen und zeichnet sich neu,
 * wie das Verwaltungsfenster.
 *
 * Imperativ gebautes DOM wie ueberall im Modul, kein Handlebars.
 */

/** Eine Szene, die sich als Karte des Moduls ausweist. */
interface Kandidat {
  szene: FoundryScene;
  /** Gepaddet, `08-01`. */
  szenario: string;
  /** Dateiname der Karte ohne Endung, `the-laboratory`. */
  datei: string;
  hintergrund: string;
}

/** Was das Zeichnen ausgerechnet hat; die Knoepfe rechnen damit weiter. */
interface Stand {
  szenario: string;
  datei: string;
  auszug: Wandauszug;
  masse: Kartenmasse;
  zeilen: Quelltextzeilen;
}

/** Das Hintergrundbild liegt seit v14 in der ersten Ebene der Szene. */
function hintergrundVon(szene: FoundryScene): string | undefined {
  const quelle = szene.levels?.contents?.[0]?.background?.src;
  return typeof quelle === 'string' && quelle !== '' ? quelle : undefined;
}

/**
 * Alle Szenen, zu denen sich eine Kartenkennung bilden laesst.
 *
 * Der Szenario-Schluessel kommt aus den Flags des Moduls und nur ersatzweise
 * aus dem Bildpfad: Das Flag ist die verlaesslichere Quelle, der Pfad haengt
 * an der gewaehlten Bildwurzel. Der Dateiname dagegen steht **nur** im Pfad —
 * der Anzeigename der Szene ist der Kartentitel und muss ihm nicht gleichen.
 */
function kandidaten(): Kandidat[] {
  const gefunden: Kandidat[] = [];
  for (const szene of game.scenes?.contents ?? []) {
    const hintergrund = hintergrundVon(szene);
    if (hintergrund === undefined) continue;
    const kennung = kartenkennungAusPfad(hintergrund);
    if (!kennung) continue;
    const szenario = lies(szene).scenario ?? kennung.szenario;
    if (szenario === undefined) continue;
    gefunden.push({ szene, szenario, datei: kennung.datei, hintergrund });
  }

  return gefunden.sort((a, b) =>
    a.szenario === b.szenario
      ? a.szene.name.localeCompare(b.szene.name)
      : a.szenario.localeCompare(b.szenario),
  );
}

/** Ein Zahlenfeld, das leer oder unbrauchbar sein darf. */
function zahlOder(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const zahl = Number(text);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : undefined;
}

export class PfsKartenExportApp extends foundry.applications.api.ApplicationV2 {
  // Der Titel steht als **roher Schluessel** da, nicht als L(...): Dieser
  // Initialisierer laeuft beim Laden des Bundles, lange vor `init`.
  // ApplicationV2 uebersetzt `window.title` selbst beim Anzeigen.
  static override DEFAULT_OPTIONS: Record<string, unknown> = {
    id: 'pfs-scenario-tools-kartenexport',
    window: {
      title: 'PFSST.Kartenexport.Titel',
      icon: 'fa-solid fa-draw-polygon',
      resizable: true,
    },
    // Breit genug fuer die laengste Quelltextzeile ohne Umbruch — der Import
    // in `waende.ts` misst bei einem langen Kartennamen rund 90 Zeichen.
    position: { width: 720 },
    actions: {
      herunterladen: PfsKartenExportApp.#herunterladen,
      kopieren: PfsKartenExportApp.#kopieren,
      schliessen: PfsKartenExportApp.#schliessen,
    },
  };

  #szenario: string | undefined;
  #szeneId: string | undefined;
  /** Von Hand eingetragene Skalierung, samt der Auswahl, fuer die sie gilt. */
  #skalierungText: string | undefined;
  #skalierungFuer: string | undefined;
  /** Gemessene Bildbreiten; ein Bild wird je Sitzung nur einmal geladen. */
  readonly #bildBreiten = new Map<string, number | undefined>();
  #stand: Stand | undefined;

  protected override async _renderHTML(): Promise<HTMLElement> {
    const liste = kandidaten();
    const inhalt = document.createElement('div');

    if (liste.length === 0) {
      this.#stand = undefined;
      inhalt.append(absatz(L('Kartenexport.Leer'), 'notes'), this.#baueFussleiste(false));
      return inhalt;
    }

    // Die Auswahl wird bei jedem Zeichnen gegen die Welt geprueft: Eine Szene
    // kann inzwischen geloescht oder umbenannt sein, das Fenster bleibt offen.
    const szenarien = [...new Set(liste.map((kandidat) => kandidat.szenario))];
    if (this.#szenario === undefined || !szenarien.includes(this.#szenario)) {
      this.#szenario = szenarien[0];
    }
    const imSzenario = liste.filter((kandidat) => kandidat.szenario === this.#szenario);
    if (this.#szeneId === undefined || !imSzenario.some((k) => k.szene.id === this.#szeneId)) {
      this.#szeneId = imSzenario[0]?.szene.id;
    }
    const gewaehlt = imSzenario.find((kandidat) => kandidat.szene.id === this.#szeneId);
    if (!gewaehlt) {
      this.#stand = undefined;
      inhalt.append(absatz(L('Kartenexport.Leer'), 'notes'), this.#baueFussleiste(false));
      return inhalt;
    }

    inhalt.append(absatz(L('Kartenexport.Hinweis'), 'notes'));

    inhalt.append(
      this.#baueAuswahl(
        'szenario',
        L('Kartenexport.SzenarioFeld'),
        szenarien.map((schluessel) => [schluessel, schluessel] as const),
        this.#szenario,
        (wert) => {
          this.#szenario = wert;
          // Die Szene des alten Szenarios gilt nicht mehr; das Zeichnen
          // waehlt die erste des neuen.
          this.#szeneId = undefined;
        },
      ),
    );

    inhalt.append(
      this.#baueAuswahl(
        'szene',
        L('Kartenexport.SzeneFeld'),
        imSzenario.map(
          (kandidat) => [kandidat.szene.id, `${kandidat.szene.name} (${kandidat.datei})`] as const,
        ),
        this.#szeneId,
        (wert) => {
          this.#szeneId = wert;
        },
      ),
    );

    const stand = await this.#rechne(gewaehlt);
    this.#stand = stand;

    inhalt.append(this.#baueSkalierung(stand.masse.skalierung ?? 1));
    inhalt.append(baueBericht(gewaehlt, stand));
    inhalt.append(baueZeilen(stand.zeilen));
    inhalt.append(this.#baueFussleiste(stand.auszug.waende.length > 0));
    return inhalt;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /** Liest Masse und Waende der gewaehlten Szene und baut die Zeilen dazu. */
  async #rechne(gewaehlt: Kandidat): Promise<Stand> {
    // Die Quelldaten, nicht die Felder des Dokuments — `threshold` und
    // `animation` sind dort Teilmodelle und kaemen anders heraus als in der
    // Datei, die `tools/exportiere-waende.mjs` schreibt.
    const auszug = wandauszug(
      (gewaehlt.szene.walls?.contents ?? []).map((wand) => wand.toObject()),
    );

    const auswahl = `${gewaehlt.szenario}/${gewaehlt.datei}`;
    if (this.#skalierungFuer !== auswahl) {
      this.#skalierungFuer = auswahl;
      this.#skalierungText = undefined;
    }

    // Reihenfolge mit Absicht: erst aus der Szene gerechnet, dann der
    // Tabellenwert. Der Export soll sagen, was **jetzt** in der Welt steht —
    // wer die Leinwand geaendert hat, will nicht den alten Eintrag zurueck.
    const bildBreite = await this.#bildBreite(gewaehlt.hintergrund);
    const gerechnet =
      bildBreite === undefined
        ? undefined
        : skalierungAus(gewaehlt.szene.width ?? 0, bildBreite);
    const vorschlag =
      gerechnet ?? kartenEinstellung(gewaehlt.szenario, gewaehlt.datei)?.skalierung ?? 1;

    const masse: Kartenmasse = {
      gitter: gewaehlt.szene.grid?.size ?? 0,
      versatzX: gewaehlt.szene.shiftX ?? 0,
      versatzY: gewaehlt.szene.shiftY ?? 0,
      skalierung: zahlOder(this.#skalierungText) ?? vorschlag,
    };

    return {
      szenario: gewaehlt.szenario,
      datei: gewaehlt.datei,
      auszug,
      masse,
      zeilen: quelltextzeilen(gewaehlt.szenario, gewaehlt.datei, masse),
    };
  }

  /**
   * Die natuerliche Breite des Hintergrundbildes.
   *
   * Nur fuer den Skalierungs-Vorschlag. Schlaegt das Laden fehl, bleibt es
   * beim Tabellenwert und beim Eingabefeld — das Bild liegt im Datenbaum,
   * nicht in der Welt, und ein Pfad kann veralten.
   */
  async #bildBreite(pfad: string): Promise<number | undefined> {
    if (this.#bildBreiten.has(pfad)) return this.#bildBreiten.get(pfad);
    const breite = await new Promise<number | undefined>((fertig) => {
      const bild = new Image();
      bild.addEventListener('load', () => fertig(bild.naturalWidth || undefined));
      bild.addEventListener('error', () => fertig(undefined));
      // `getRoute`, nicht der nackte Pfad: Ein Foundry hinter einem
      // Unterverzeichnis loest sonst gegen die Seiten-URL auf.
      bild.src = foundry.utils.getRoute(pfad);
    });
    this.#bildBreiten.set(pfad, breite);
    return breite;
  }

  #baueAuswahl(
    name: string,
    beschriftung: string,
    optionen: readonly (readonly [string, string])[],
    gewaehlt: string | undefined,
    beiWahl: (wert: string) => void,
  ): HTMLElement {
    const gruppe = document.createElement('div');
    gruppe.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = beschriftung;

    const felder = document.createElement('div');
    felder.className = 'form-fields';

    const auswahl = document.createElement('select');
    auswahl.name = name;
    for (const [wert, text] of optionen) {
      const option = document.createElement('option');
      option.value = wert;
      option.textContent = text;
      if (wert === gewaehlt) option.selected = true;
      auswahl.append(option);
    }
    // Die Zuhoerer bleiben am Leben: `_replaceHTML` haengt genau diese Knoten
    // ins Fenster, es klont nichts (anders als `DialogV2`).
    auswahl.addEventListener('change', () => {
      beiWahl(auswahl.value);
      void this.render();
    });

    felder.append(auswahl);
    gruppe.append(label, felder);
    return gruppe;
  }

  #baueSkalierung(wert: number): HTMLElement {
    const gruppe = document.createElement('div');
    gruppe.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = L('Kartenexport.SkalierungFeld');

    const felder = document.createElement('div');
    felder.className = 'form-fields';

    const feld = document.createElement('input');
    feld.type = 'number';
    feld.name = 'skalierung';
    feld.step = '0.01';
    feld.min = '0.1';
    feld.value = String(wert);
    feld.addEventListener('change', () => {
      this.#skalierungText = feld.value;
      void this.render();
    });

    felder.append(feld);
    gruppe.append(label, felder, absatz(L('Kartenexport.SkalierungHinweis'), 'notes'));
    return gruppe;
  }

  /**
   * Die Knopfleiste am Fuss.
   *
   * `Herunterladen` fehlt, solange die Szene keine Waende hat — eine leere
   * Wanddatei im Repo hiesse „diese Karte hat keine Waende", und das ist eine
   * andere Aussage als „noch nicht gezeichnet".
   */
  #baueFussleiste(mitDatei: boolean): HTMLElement {
    const leiste = document.createElement('footer');
    leiste.className = 'form-footer';
    leiste.style.display = 'flex';
    leiste.style.gap = '0.5rem';
    leiste.style.marginTop = '0.75rem';

    // Die Beschriftung kommt **fertig uebersetzt** herein, nicht als
    // Schluessel: Ein ueber eine Variable gebauter `L`-Aufruf ist fuer
    // `tools/pruefe.mjs` unsichtbar.
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

    if (mitDatei) {
      leiste.append(
        knopf('herunterladen', L('Kartenexport.Herunterladen'), 'fa-file-arrow-down', true),
        knopf('kopieren', L('Kartenexport.Kopieren'), 'fa-clipboard'),
      );
    }
    leiste.append(knopf('schliessen', L('Uebersicht.Schliessen'), 'fa-xmark'));
    return leiste;
  }

  static async #herunterladen(this: PfsKartenExportApp): Promise<void> {
    const stand = this.#stand;
    if (!stand || stand.auszug.waende.length === 0) {
      ui.notifications?.warn(L('Kartenexport.KeineWaende'));
      return;
    }

    foundry.utils.saveDataToFile(
      wanddateiText(stand.auszug.waende),
      'application/json',
      `${stand.datei}.json`,
    );
    ui.notifications?.info(
      L('Kartenexport.Heruntergeladen', {
        anzahl: stand.auszug.waende.length,
        pfad: stand.zeilen.dateipfad,
      }),
    );
  }

  static async #kopieren(this: PfsKartenExportApp): Promise<void> {
    const feld = this.element.querySelector<HTMLTextAreaElement>('textarea[name="zeilen"]');
    if (!feld) return;
    try {
      await navigator.clipboard.writeText(feld.value);
      ui.notifications?.info(L('Kartenexport.Kopiert'));
    } catch {
      // Die Zwischenablage gibt es nur in einem sicheren Kontext. Die
      // Testinstanz laeuft im LAN ueber http — dort bleibt das Markieren.
      feld.select();
      ui.notifications?.warn(L('Kartenexport.KopierenFehlt'));
    }
  }

  static async #schliessen(this: PfsKartenExportApp): Promise<void> {
    await this.close();
  }
}

function absatz(text: string, klasse?: string): HTMLElement {
  const element = document.createElement('p');
  if (klasse !== undefined) element.className = klasse;
  element.textContent = text;
  return element;
}

/**
 * Was die Szene hergibt, in Zahlen — und der Vergleich mit dem Repo.
 *
 * Der Vergleich ist die Eichung: Fuer eine Karte, deren Wanddatei es schon
 * gibt, muss „unveraendert" herauskommen. Steht dort etwas anderes, ist
 * entweder gezeichnet worden oder der Weg von innen liefert nicht dasselbe
 * wie das Werkzeug — und das will man wissen, bevor die Datei in einen Pull
 * Request geht.
 */
function baueBericht(gewaehlt: Kandidat, stand: Stand): HTMLElement {
  const block = document.createElement('div');

  block.append(
    absatz(
      L('Kartenexport.Masse', {
        gitter: stand.masse.gitter,
        versatzX: stand.masse.versatzX,
        versatzY: stand.masse.versatzY,
        breite: gewaehlt.szene.width ?? 0,
        hoehe: gewaehlt.szene.height ?? 0,
      }),
      'notes',
    ),
    absatz(
      L('Kartenexport.Zahlen', {
        waende: stand.auszug.waende.length,
        tueren: stand.auszug.tueren,
      }),
      'notes',
    ),
  );

  if (stand.auszug.doppel > 0) {
    block.append(absatz(L('Kartenexport.Doppel', { anzahl: stand.auszug.doppel }), 'notes'));
  }
  if (stand.auszug.verworfen > 0) {
    block.append(
      absatz(L('Kartenexport.Verworfen', { anzahl: stand.auszug.verworfen }), 'notification warning'),
    );
  }

  const imRepo = kartenWaende(stand.szenario, stand.datei);
  if (imRepo === undefined) {
    block.append(absatz(L('Kartenexport.Neu'), 'notification info'));
  } else if (wandSignaturen(imRepo) === wandSignaturen(stand.auszug.waende)) {
    block.append(absatz(L('Kartenexport.Unveraendert'), 'notification info'));
  } else {
    block.append(
      absatz(L('Kartenexport.Abweichend', { anzahl: imRepo.length }), 'notification warning'),
    );
  }

  return block;
}

/** Die Quelltextzeilen, nach Zieldatei gruppiert und zum Markieren bereit. */
function baueZeilen(zeilen: Quelltextzeilen): HTMLElement {
  const gruppe = document.createElement('div');
  gruppe.className = 'form-group';

  const label = document.createElement('label');
  label.textContent = L('Kartenexport.ZeilenFeld');

  const feld = document.createElement('textarea');
  feld.name = 'zeilen';
  feld.readOnly = true;
  feld.rows = 6;
  feld.style.fontFamily = 'var(--font-mono, monospace)';
  feld.style.whiteSpace = 'pre';
  feld.value = [
    zeilen.dateipfad,
    '',
    'src/world/waende.ts',
    zeilen.importZeile,
    zeilen.tabellenZeile,
    '',
    'src/world/karten-einstellungen.ts',
    zeilen.einstellungsZeile,
  ].join('\n');

  gruppe.append(label, feld);
  return gruppe;
}

/**
 * Oeffnet das Fenster — genau **eine** Fassung ueber die ganze Sitzung.
 *
 * ApplicationV2 fuehrt seine Fenster ueber die Kennung aus `DEFAULT_OPTIONS`;
 * zwei Fenster mit derselben Kennung vertragen sich nicht. Ein zweiter Klick
 * holt also das offene nach vorn, wie beim Verwaltungsfenster.
 */
let fenster: PfsKartenExportApp | undefined;

export async function zeigeKartenExport(): Promise<void> {
  fenster ??= new PfsKartenExportApp();
  await fenster.render({ force: true });
}
