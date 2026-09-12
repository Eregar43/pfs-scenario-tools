/**
 * Die Foundry-Kern-API, so weit dieses Modul sie anfasst — und keinen Deut
 * weiter.
 *
 * Warum nicht `foundry-vtt-types`: Das Paket ist gross und in 14.365
 * stellenweise widerspruechlich (das `Level`-Dokument traegt
 * `schemaVersion: "14.365"`, `Scene.Schema` kennt es aber nicht). Eine eigene
 * kleine Deklaration hat einen zweiten Nutzen: sie ist die Liste dessen, was
 * wir am Kern wirklich benutzen. Waechst sie unbemerkt, ist das ein Signal.
 *
 * Ergaenzt wird sie Etappe fuer Etappe, nicht auf Vorrat.
 */

export {};

declare global {
  interface PfsScenarioToolsApi {
    readonly moduleId: string;
    readonly version: string;
    readonly importieren: typeof import('./ui/import-dialog.ts').zeigeImportDialog;
    readonly uebersicht: typeof import('./ui/uebersicht-dialog.ts').zeigeUebersicht;
    readonly willkommen: typeof import('./ui/willkommen-dialog.ts').zeigeWillkommen;
    readonly szenarioAusDatei: typeof import('./lesen.ts').szenarioAusDatei;
    readonly fasseZusammen: typeof import('./lesen.ts').fasseZusammen;
  }

  interface Game {
    i18n: {
      localize(key: string): string;
      format(key: string, data?: Record<string, unknown>): string;
      readonly translations: Record<string, unknown>;
    };
    settings: {
      register(namespace: string, key: string, data: Record<string, unknown>): void;
      registerMenu(namespace: string, key: string, data: Record<string, unknown>): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
    modules: {
      get(id: string): { active?: boolean; version?: string; api?: unknown } | undefined;
    };
    user?: { isGM?: boolean };
    folders?: FoundryCollection<FoundryFolder>;
    journal?: FoundryCollection<FoundryJournalEntry>;
    scenes?: FoundryCollection<FoundryScene>;
    actors?: FoundryCollection<FoundryActor>;
    items?: FoundryCollection<FoundryItem>;
    packs?: FoundryCollection<FoundryPack>;
    /** Bequemer Griff in der Konsole; die Schnittstelle liegt auch am Modul. */
    pfsScenarioTools?: PfsScenarioToolsApi;
  }

  interface FoundryCollection<T> {
    get(id: string): T | undefined;
    filter(pruefung: (eintrag: T) => boolean): T[];
    readonly contents: T[];
  }

  /**
   * Ein Eintrag aus `pack.getIndex()`. Von Haus aus liefert er nur
   * `_id, name, img, type, sort, folder`; alles Weitere muss ueber `fields`
   * angefordert werden — das pf2e-System erweitert die Vorgabe nicht.
   */
  interface FoundryIndexEintrag {
    _id: string;
    name?: string;
    type?: string;
    system?: {
      details?: { level?: { value?: number } };
      value?: { isValued?: boolean };
    };
  }

  interface FoundryPack {
    collection: string;
    getIndex(optionen?: { fields?: string[] }): Promise<{ contents: FoundryIndexEintrag[] }>;
  }

  interface FoundryFolder {
    id: string;
    name: string;
    type: string;
    color?: unknown;
    folder?: { id: string } | null;
    flags?: Record<string, Record<string, unknown> | undefined>;
    update(daten: Record<string, unknown>): Promise<unknown>;
  }

  interface FoundryJournalPage {
    id: string;
    name: string;
    title?: { level?: number };
    text?: { content?: string };
    /** Bei Bildseiten (`type: "image"`) der Pfad der Datei. */
    src?: string;
  }

  /**
   * Eine Ebene einer Szene (Foundry v14): Hintergrundbild und -farbe leben
   * hier, nicht mehr am Szenen-Dokument.
   */
  interface FoundryLevel {
    id: string;
    background?: { src?: string | null; color?: string | null };
  }

  /** Eine Wand am Szenen-Dokument; `c` ist `[x1, y1, x2, y2]`. */
  interface FoundryWall {
    id: string;
    c?: number[];
    /**
     * Die Quelldaten der Wand — was der Export ins Repo schreibt.
     *
     * Nicht die Felder des Dokuments: `threshold` und `animation` sind dort
     * Teilmodelle, und `JSON.stringify` darauf ist nicht dasselbe wie der in
     * der Welt gespeicherte Wert. `tools/exportiere-waende.mjs` liest die
     * Quelldaten, also muss der Weg von innen es auch tun.
     */
    toObject(): Record<string, unknown>;
    /** Die uebrigen Vergleichsfelder (move, sight, door, ds, …). */
    [feld: string]: unknown;
  }

  interface FoundryScene {
    id: string;
    name: string;
    folder?: { id: string } | null;
    flags?: Record<string, Record<string, unknown> | undefined>;
    grid?: { size?: number; alpha?: number };
    /** Versatz der Spielflaeche — im Dialog „Shift", die Messwerte der Karten. */
    shiftX?: number;
    shiftY?: number;
    /**
     * Groesse der Leinwand in Bildpunkten.
     *
     * Schon **mit** Skalierung: `apply.ts` legt sie als Bildmass mal Faktor
     * an. Der Export teilt deshalb zurueck, statt einen Faktor zu suchen, den
     * die Szene nicht fuehrt.
     */
    width?: number;
    height?: number;
    levels?: FoundryCollection<FoundryLevel> & Iterable<FoundryLevel>;
    walls?: FoundryCollection<FoundryWall> & Iterable<FoundryWall>;
    update(daten: Record<string, unknown>): Promise<unknown>;
    createEmbeddedDocuments(typ: string, daten: Record<string, unknown>[]): Promise<unknown>;
    updateEmbeddedDocuments(typ: string, daten: Record<string, unknown>[]): Promise<unknown>;
    /** `deleteAll: true` loescht alle eingebetteten Dokumente des Typs, die Id-Liste ist dann leer. */
    deleteEmbeddedDocuments(
      typ: string,
      ids: string[],
      optionen?: { deleteAll?: boolean },
    ): Promise<unknown>;
    /** Rendert das Vorschaubild; `thumb` ist das Base64-Bild fuer `update`. */
    createThumbnail(daten?: Record<string, unknown>): Promise<{ thumb: string }>;
  }

  interface FoundryActor {
    id: string;
    name: string;
    folder?: { id: string } | null;
    flags?: Record<string, Record<string, unknown> | undefined>;
    update(daten: Record<string, unknown>): Promise<unknown>;
    /**
     * PF2e-eigene Methode fuer Elite und Schwach — nie ein blankes Update
     * auf `system.attributes.adjustment`, nur sie zieht die Trefferpunkte
     * nach. Optional, weil sie dem System gehoert, nicht dem Core.
     */
    applyAdjustment?(anpassung: 'elite' | 'weak' | null): Promise<void>;
  }

  /** Ein Kompendiums-Dokument, so weit der Import es braucht. */
  interface FoundryCompendiumActor {
    toObject(): Record<string, unknown> & { _id?: string; flags?: unknown };
  }

  interface FoundryJournalEntry {
    id: string;
    name: string;
    folder?: { id: string } | null;
    flags?: Record<string, Record<string, unknown> | undefined>;
    pages?: FoundryCollection<FoundryJournalPage> & Iterable<FoundryJournalPage>;
    update(daten: Record<string, unknown>): Promise<unknown>;
    createEmbeddedDocuments(
      typ: string,
      daten: Record<string, unknown>[],
      optionen?: Record<string, unknown>,
    ): Promise<unknown>;
    updateEmbeddedDocuments(typ: string, daten: Record<string, unknown>[]): Promise<unknown>;
    deleteEmbeddedDocuments(typ: string, ids: string[]): Promise<unknown>;
    sheet?: { render(force?: boolean): unknown };
  }

  const Folder: {
    deleteDocuments(ids: string[], optionen?: Record<string, unknown>): Promise<unknown>;
    create(daten: Record<string, unknown>): Promise<FoundryFolder | undefined>;
  };

  const JournalEntry: {
    deleteDocuments(ids: string[], optionen?: Record<string, unknown>): Promise<unknown>;
    create(
      daten: Record<string, unknown>,
      optionen?: Record<string, unknown>,
    ): Promise<FoundryJournalEntry | undefined>;
  };

  const Scene: {
    deleteDocuments(ids: string[], optionen?: Record<string, unknown>): Promise<unknown>;
    createDocuments(
      daten: Record<string, unknown>[],
      optionen?: Record<string, unknown>,
    ): Promise<unknown>;
  };

  interface FoundryItem {
    id: string;
    name: string;
    folder?: { id: string } | null;
    flags?: Record<string, Record<string, unknown> | undefined>;
  }

  const Item: {
    deleteDocuments(ids: string[], optionen?: Record<string, unknown>): Promise<unknown>;
    createDocuments(
      daten: Record<string, unknown>[],
      optionen?: Record<string, unknown>,
    ): Promise<unknown>;
  };

  const Actor: {
    deleteDocuments(ids: string[], optionen?: Record<string, unknown>): Promise<unknown>;
    create(
      daten: Record<string, unknown>,
      optionen?: Record<string, unknown>,
    ): Promise<FoundryActor | undefined>;
    /**
     * Die vom System eingerichtete Unterklasse (`CONFIG.Actor.documentClass`).
     * Ueber sie kommt man an `getDefaultArtwork` des PF2e-Systems.
     */
    implementation?: {
      /** Standardbild und -token je Actor-Art; beim PF2e-System `npc.svg` & Co. */
      getDefaultArtwork?(daten: { type?: unknown }): {
        img?: string;
        texture?: { src?: string };
      };
    };
  };

  /** Foundrys Konstanten; gebraucht wird bisher nur das Standard-Tokenbild. */
  const CONST: {
    /** `icons/svg/mystery-man.svg` — Foundrys Platzhalter fuer Tokens. */
    DEFAULT_TOKEN: string;
  };

  const game: Game;

  interface FoundryNotification {
    update(update: { message?: string; pct?: number }): void;
    remove(): void;
  }

  interface NotifyOptions {
    permanent?: boolean;
    progress?: boolean;
    console?: boolean;
  }

  const ui: {
    notifications?: {
      info(message: string, options?: NotifyOptions): FoundryNotification;
      warn(message: string, options?: NotifyOptions): FoundryNotification;
      error(message: string, options?: NotifyOptions): FoundryNotification;
    };
  };

  const Hooks: {
    once(hook: string, callback: (...args: never[]) => void): number;
    on(hook: string, callback: (...args: never[]) => void): number;
  };

  /**
   * Nur das Minimum, das das Einstellungsfenster braucht: ein Basiswerkzeug
   * zum Ableiten, imperativ befuellt wie `DialogV2` — kein Handlebars.
   */
  abstract class ApplicationV2 {
    constructor(options?: Record<string, unknown>);
    static DEFAULT_OPTIONS: Record<string, unknown>;
    readonly element: HTMLElement;
    render(options?: boolean | Record<string, unknown>): Promise<this>;
    close(options?: Record<string, unknown>): Promise<this>;
    protected _renderHTML(
      context: Record<string, unknown>,
      options: Record<string, unknown>,
    ): Promise<HTMLElement>;
    protected _replaceHTML(
      result: HTMLElement,
      content: HTMLElement,
      options: Record<string, unknown>,
    ): void;
  }

  interface FilePickerOptions {
    type?: 'folder' | 'any' | 'image' | 'imagevideo' | 'audio' | 'video' | 'text' | 'font';
    current?: string;
    callback?: (path: string) => void;
  }

  interface FilePickerInstance {
    render(force?: boolean): unknown;
  }

  /**
   * Die Klasse traegt neben dem Konstruktor auch die statischen Dateiwege.
   * `upload`: das vierte Argument ist der POST-Body, `{notify}` gehoert ins
   * fuenfte. Antwort ist `false` bei stillem Fehlschlag.
   */
  interface FilePickerClass {
    new (options: FilePickerOptions): FilePickerInstance;
    browse(
      source: string,
      target: string,
      options?: Record<string, unknown>,
    ): Promise<{ target: string; dirs: string[]; files: string[] }>;
    createDirectory(
      source: string,
      target: string,
      options?: Record<string, unknown>,
    ): Promise<string>;
    upload(
      source: string,
      path: string,
      file: File,
      body?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{ path?: string } | false>;
  }

  /**
   * Das Journal-Blatt der Kern-API, nur zum Ableiten: Das Modul aendert kein
   * Verhalten, es haengt lediglich eine eigene CSS-Klasse ans Fenster.
   * `DEFAULT_OPTIONS` wird entlang der Erbkette zusammengefuehrt,
   * `classes`-Listen werden dabei vereinigt.
   */
  abstract class FoundryJournalEntrySheet extends ApplicationV2 {
    /** Das Journal, das dieses Blatt zeigt. */
    readonly document: FoundryJournalEntry;
    protected _onRender(
      context: Record<string, unknown>,
      options: Record<string, unknown>,
    ): Promise<void>;
  }

  const foundry: {
    utils: {
      getRoute(path: string): string;
      fromUuid(uuid: string): Promise<unknown>;
      saveDataToFile(data: string, type: string, filename: string): void;
    };
    applications: {
      api: {
        DialogV2: {
          wait(config: Record<string, unknown>): Promise<unknown>;
        };
        ApplicationV2: typeof ApplicationV2;
      };
      apps: {
        FilePicker: {
          implementation: FilePickerClass;
        };
        /**
         * Traegt ein Blatt in den Auswahl-Dialog „Sheet Configuration" ein.
         * Foundry bildet die Kennung selbst als `<scope>.<Klassenname>` —
         * darum darf der Build Klassennamen nicht kuerzen (vite:
         * `minify: false`).
         */
        DocumentSheetConfig: {
          registerSheet(
            documentClass: unknown,
            scope: string,
            sheetClass: unknown,
            options?: { label?: string | (() => string); makeDefault?: boolean },
          ): void;
        };
      };
      sheets: {
        journal: {
          JournalEntrySheet: typeof FoundryJournalEntrySheet;
        };
      };
    };
  };

  /**
   * Die Nachschlagewerke des laufenden Systems.
   *
   * Nur die Schluessel werden gebraucht, nicht die Beschriftungen: Sie sagen,
   * welche Merkmale und Immunitaeten PF2e ueberhaupt kennt. Wer sie nicht
   * abfragt, sondern eine eigene Liste mitbringt, hat sie ab dem naechsten
   * Systemupdate falsch — und merkt es nicht, weil Foundry unbekannte Werte
   * stillschweigend verwirft.
   */
  const CONFIG: {
    PF2E?: {
      hazardTraits?: Record<string, string>;
      actionTraits?: Record<string, string>;
      npcAttackTraits?: Record<string, string>;
      creatureTraits?: Record<string, string>;
      senses?: Record<string, string>;
      languages?: Record<string, string>;
      immunityTypes?: Record<string, string>;
      weaknessTypes?: Record<string, string>;
      resistanceTypes?: Record<string, string>;
    };
  };
}
