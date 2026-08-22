import { L } from '../i18n.ts';
import { MODULE_ID, SETTING_BILDWURZEL } from '../settings.ts';

/**
 * Einstellungsfenster fuer Pfade, die Foundrys normale Einstellungsliste
 * nicht anbieten kann. `SettingConfig` hat kein Feld fuer einen
 * Verzeichnis-Waehler, und `input` ist seit v13 funktionslos — deshalb
 * `ApplicationV2` statt eines einfachen `register`-Eintrags.
 *
 * Imperativ gebautes DOM wie `DialogV2` andernorts im Modul, kein
 * Handlebars.
 */
export class PfsEinstellungenApp extends foundry.applications.api.ApplicationV2 {
  // Der Titel steht hier als **roher Schluessel**, nicht als L(...):
  // Dieser Initialisierer laeuft beim Laden des Bundles, lange vor `init` —
  // `game.i18n` gibt es da noch nicht, und der Wurf risse das ganze Modul
  // um (kein init-Hook, keine Einstellungen, kein Eintrag in Game Settings).
  // ApplicationV2 uebersetzt `window.title` selbst beim Anzeigen.
  static override DEFAULT_OPTIONS: Record<string, unknown> = {
    id: 'pfs-scenario-tools-einstellungen',
    window: { title: 'PFSST.Einstellungen.Bildwurzel.Fenstertitel', icon: 'fa-solid fa-folder-open' },
    position: { width: 480 },
    actions: {
      waehlen: PfsEinstellungenApp.#waehlen,
      speichern: PfsEinstellungenApp.#speichern,
    },
  };

  protected override async _renderHTML(): Promise<HTMLElement> {
    const inhalt = document.createElement('div');

    const hinweis = document.createElement('p');
    hinweis.className = 'notes';
    hinweis.textContent = L('Einstellungen.Bildwurzel.Hinweis');
    inhalt.append(hinweis);

    const feld = document.createElement('div');
    feld.className = 'form-group';

    const beschriftung = document.createElement('label');
    beschriftung.textContent = L('Einstellungen.Bildwurzel.Feldname');
    feld.append(beschriftung);

    const zeile = document.createElement('div');
    zeile.className = 'form-fields';

    const eingabe = document.createElement('input');
    eingabe.type = 'text';
    eingabe.name = 'bildWurzel';
    eingabe.readOnly = true;
    eingabe.value = String(game.settings.get(MODULE_ID, SETTING_BILDWURZEL) ?? '');

    const waehlen = document.createElement('button');
    waehlen.type = 'button';
    waehlen.dataset.action = 'waehlen';
    waehlen.innerHTML = `<i class="fa-solid fa-folder-open"></i> ${L('Einstellungen.Bildwurzel.Waehlen')}`;

    zeile.append(eingabe, waehlen);
    feld.append(zeile);
    inhalt.append(feld);

    const speichern = document.createElement('button');
    speichern.type = 'button';
    speichern.className = 'default';
    speichern.dataset.action = 'speichern';
    speichern.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${L('Einstellungen.Bildwurzel.Speichern')}`;
    inhalt.append(speichern);

    return inhalt;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /**
   * Foundrys eigener Waehler statt eines Textfelds: `bildWurzel` muss ein
   * Ordner in `Data/` sein, kein frei getippter Pfad.
   */
  static #waehlen(this: PfsEinstellungenApp, _event: PointerEvent): void {
    const eingabe = this.element.querySelector<HTMLInputElement>('input[name="bildWurzel"]');
    new foundry.applications.apps.FilePicker.implementation({
      type: 'folder',
      current: eingabe?.value || undefined,
      callback: (pfad) => {
        if (eingabe) eingabe.value = pfad;
      },
    }).render(true);
  }

  static async #speichern(this: PfsEinstellungenApp): Promise<void> {
    const eingabe = this.element.querySelector<HTMLInputElement>('input[name="bildWurzel"]');
    await game.settings.set(MODULE_ID, SETTING_BILDWURZEL, eingabe?.value ?? '');
    ui.notifications?.info(L('Einstellungen.Bildwurzel.Gespeichert'));
    await this.close();
  }
}
