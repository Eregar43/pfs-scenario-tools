import { defaultColorFor, gleicheFarbe, normalisiereFarbe, officialColorFor } from './colors.ts';
import { lies, MODULE_ID, type MitFlags } from './flags.ts';
import { passtZuSeason, schluesselAusOrdnername } from './naming.ts';
import { wandSignaturen, type Wand } from './waende.ts';

/**
 * Was beim Import geschehen soll — als reine Daten, ohne eine einzige
 * Foundry-API.
 *
 * Das ist der architektonische Hebel dieses Moduls: der gesamte
 * Entscheidungsteil ist damit ohne Attrappen pruefbar, und der Dialog kann den
 * Plan **zeigen**, bevor irgendetwas passiert. `apply.ts` fuehrt ihn nur noch
 * aus und bleibt dumm.
 */

/** Abbild eines vorhandenen Weltordners, so viel wie die Planung braucht. */
export interface OrdnerAbbild extends MitFlags {
  id: string;
  name: string;
  /** Elternordner; `null` heisst oberste Ebene. */
  elternId: string | null;
  farbe: unknown;
}

export interface SeitenAbbild {
  id: string;
  name: string;
  inhalt: string;
  /** Gliederungstiefe; nur beim Schreiben gebraucht, nicht beim Vergleichen. */
  level?: number;
  sort?: number;
}

export interface JournalAbbild extends MitFlags {
  id: string;
  name: string;
  ordnerId: string | null;
  seiten: SeitenAbbild[];
}

/** Abbild einer vorhandenen Szene, so viel wie die Planung braucht. */
export interface SzeneAbbild extends MitFlags {
  id: string;
  name: string;
  ordnerId: string | null;
  /** Pfad des Hintergrundbilds. */
  hintergrund: string;
  /** Kaestchengroesse; fehlt, wenn die Welt sie nicht hergibt. */
  gitter?: number;
  versatzX?: number;
  versatzY?: number;
  /** Kennzeichen der vorhandenen Waende (`wandSignaturen`), '' fuer keine. */
  waendeSignatur?: string;
}

/** Abbild eines vorhandenen Actors, so viel wie die Planung braucht. */
export interface AktorAbbild extends MitFlags {
  id: string;
  name: string;
  ordnerId: string | null;
}

/** Abbild eines vorhandenen Gegenstands — bei uns sind das die Effekte. */
export interface GegenstandAbbild extends MitFlags {
  id: string;
  name: string;
  ordnerId: string | null;
}

export interface Weltabbild {
  /** Alle Ordner vom Typ `JournalEntry`. */
  ordner: OrdnerAbbild[];
  journale: JournalAbbild[];
  /** Alle Ordner vom Typ `Scene`; fehlt in Welten ohne Szenenimport. */
  szenenOrdner?: OrdnerAbbild[];
  szenen?: SzeneAbbild[];
  /** Alle Ordner vom Typ `Actor` und die Actors der Welt. */
  aktorenOrdner?: OrdnerAbbild[];
  aktoren?: AktorAbbild[];
  /** Alle Ordner vom Typ `Item` und die Gegenstaende der Welt. */
  gegenstandsOrdner?: OrdnerAbbild[];
  gegenstaende?: GegenstandAbbild[];
}

/**
 * Ein gewuenschter Effekt: eine Zusage des Hefts als PF2e-Gegenstand.
 *
 * Wie bei den Kreaturen gilt: nie loeschen, nie auffrischen. An einem Effekt
 * kann der Spielleiter gedreht haben.
 */
export interface EffektWunsch {
  /** Stabile Kennung, aus Szenariotitel und Wortlaut abgeleitet. */
  id: string;
  name: string;
  /** Der Satz aus dem Heft — Anker fuer den Verweis im Journal. */
  satz: string;
  /** Fertige Gegenstandsdaten aus `effekte.ts::baueEffekt`. */
  daten: Record<string, unknown>;
}

/** Eine gewuenschte Kreatur: aus dem Kompendium, gegebenenfalls angepasst. */
export interface KreaturWunsch {
  /** Stabile Kennung, aus Szenariotitel, Vorlage und Fassung abgeleitet. */
  id: string;
  /** Name von Actor und Token — der Wortlaut der Statblock-Kopfzeile. */
  name: string;
  /**
   * Volle Dokument-Kennung der Vorlage, `Compendium.<pack>.Actor.<id>`.
   *
   * Fehlt bei szenarioeigenen Gefahren: Die haben keine Vorlage und bringen
   * ihre Werte in `daten` mit.
   */
  uuid?: string;
  /**
   * Fertige Actordaten statt einer Vorlage.
   *
   * Gesetzt, wo es nichts zu kopieren gibt — an der Season 8 gemessen sind
   * das genau die fuenf Gefahren. Liegt das Feld vor, legt `apply.ts` daraus
   * an, statt aus dem Kompendium zu kopieren; alles Weitere (Ordner, Flags,
   * niemals loeschen, niemals auffrischen) bleibt gleich.
   */
  daten?: Record<string, unknown>;
  anpassung?: 'elite' | 'weak';
  /**
   * Pfad des Personenbilds aus dem Heft, falls eines denselben Namen traegt.
   *
   * Es wird nur **beim Anlegen** gesetzt. Ein vorhandener Actor wird nicht
   * angefasst — daran haengt womoeglich Handarbeit des Spielleiters.
   */
  bild?: string;
  /**
   * Das Bild, das auch als **Token** stehen soll.
   *
   * Gesetzt, wo das Portraet aus dem Heft das mitgebrachte Token der Vorlage
   * ersetzen soll (`bilder.ts::tokenAusPortraet`). Fehlt es, bleibt das Token
   * unangetastet.
   */
  tokenBild?: string;
  /** Soll das Token einen dynamischen Ring bekommen? */
  ring?: boolean;
  /** Basisname der Vorlage, wenn der Statblock eine Variante ist. */
  variante?: string;
  /**
   * Kennung der Bildseite im Spielhilfen-Journal.
   *
   * Nur bei NSCs gesetzt; aus ihr baut `apply.ts` den Rueckverweis in den
   * Spielleiternotizen. Die Kennung des Journals selbst steht erst beim
   * Schreiben fest, deshalb bleibt es hier bei der Seite.
   */
  journalSeite?: string;
  /** Stufe und Art der Kopfzeile — fuer die Welt-Verweise im Journal. */
  stufe: number;
  /**
   * `nsc` ist eine Person mit Bild, aber ohne Statblock (`world/nscs.ts`).
   * Sie laeuft durch dieselbe Maschinerie wie Kreaturen — Ordnerbaum, Flags,
   * Kennung, Uebersicht und Entfernen gelten unveraendert —, taucht aber nicht
   * in den Journalverweisen auf: Dort steht sie nie als Statblock.
   */
  art: 'creature' | 'hazard' | 'nsc';
}

/** Eine gewuenschte Szene: eine Karte als Hintergrund, Masse in Bildpunkten. */
export interface SzeneWunsch {
  /** Stabile Kennung, aus Szenariotitel und Dateinamen abgeleitet. */
  id: string;
  name: string;
  hintergrund: string;
  breite: number;
  hoehe: number;
  /** Handvermessene Kaestchengroesse, falls die Karte schon vermessen ist. */
  gitter?: number;
  versatzX?: number;
  versatzY?: number;
  /** Faktor zwischen Bild- und Szenengroesse; fehlt er, gilt 1. */
  skalierung?: number;
  /** Handgezeichnete Waende, falls die Karte schon welche hat. */
  waende?: Wand[];
}

export interface Wunsch {
  season: number;
  /** Gepaddet, `08-01`. */
  schluessel: string;
  seasonOrdnerName: string;
  szenarioOrdnerName: string;
  journalName: string;
  seiten: SeitenAbbild[];
  /**
   * Das Spielhilfen-Journal: eine Bildseite je Anhang-Bild. `inhalt` traegt
   * bei diesen Seiten den **Dateipfad** des Bildes — so laesst sich derselbe
   * Seitenabgleich verwenden wie beim Text.
   */
  anhang?: { journalName: string; seiten: SeitenAbbild[] };
  /** Eine Szene je Karte. */
  szenen?: SzeneWunsch[];
  /** Eine Kreatur je Fassung. */
  kreaturen?: KreaturWunsch[];
  /** Ein Effekt je Zusage des Hefts. */
  effekte?: EffektWunsch[];
}

export type OrdnerAktion =
  | { art: 'anlegen'; name: string; farbe?: string; elternId?: string }
  | { art: 'umfaerben'; id: string; name: string; farbe: string }
  | { art: 'behalten'; id: string; name: string };

export interface ImportPlan {
  seasonOrdner: OrdnerAktion;
  szenarioOrdner: OrdnerAktion;
  journal:
    | { art: 'anlegen'; name: string }
    | { art: 'aktualisieren'; id: string; name: string; alterName: string };
  seiten: {
    neu: string[];
    aktualisiert: string[];
    unveraendert: string[];
    entfallen: string[];
  };
  /** Plan fuer das Spielhilfen-Journal, falls der Wunsch eines enthaelt. */
  anhang?: {
    journal:
      | { art: 'anlegen'; name: string }
      | { art: 'aktualisieren'; id: string; name: string; alterName: string };
    seiten: ImportPlan['seiten'];
  };
  /**
   * Plan fuer die Szenen, falls der Wunsch welche enthaelt. Der Ordnerbaum
   * (Season, Szenario) entsteht ein zweites Mal als Szenen-Ordner — Foundry
   * fuehrt Ordner je Dokumentart, und `Build PFS Adventures` sammelt Szenen
   * nach demselben Namensschema wie Journale.
   *
   * `entfallen` wird nur **gemeldet, nie geloescht**: an einer Szene haengt
   * Arbeit des Spielleiters (Licht, Waende, Tokens), die kein erneuter
   * Import zerstoeren darf.
   */
  szenen?: {
    seasonOrdner: OrdnerAktion;
    szenarioOrdner: OrdnerAktion;
    szenen: ImportPlan['seiten'];
  };
  /**
   * Plan fuer die Kreaturen. Wie bei den Szenen entsteht der Ordnerbaum je
   * Dokumentart neu, und Entfallenes wird nur gemeldet — ein Actor kann vom
   * Spielleiter angepasst worden sein. Aktualisiert wird gar nicht: der
   * Import frischt keine Kompendiumskopien auf.
   */
  kreaturen?: {
    seasonOrdner: OrdnerAktion;
    szenarioOrdner: OrdnerAktion;
    kreaturen: {
      neu: string[];
      unveraendert: string[];
      entfallen: string[];
      /**
       * Wer davon sein Bild aus dem Heft bekommt. Teilmenge von `neu`:
       * Vorhandene Actors werden nicht angefasst, ihr Bild also auch nicht
       * nachgetragen.
       */
      mitBild: string[];
      /**
       * Die Personen ohne Statblock, getrennt gezaehlt — sie entstehen aus
       * dem Anhang, nicht aus einem Kompendium, und das soll die Vorschau
       * auseinanderhalten. `entfallen` bleibt gemeinsam: Am Weltbestand ist
       * einem Actor nicht anzusehen, woher er kam.
       */
      nscs: { neu: string[]; unveraendert: string[] };
    };
  };
  /**
   * Plan fuer die Effekte. Eigener Ordnerbaum, weil Foundry Ordner je
   * Dokumentart fuehrt — hier `Item`.
   */
  effekte?: {
    seasonOrdner: OrdnerAktion;
    szenarioOrdner: OrdnerAktion;
    effekte: { neu: string[]; unveraendert: string[]; entfallen: string[] };
  };
}

function findeSeasonOrdner(ordner: OrdnerAbbild[], season: number): OrdnerAbbild | undefined {
  // Flag zuerst — der Name darf einen Zusatz tragen und von Hand geaendert sein.
  const perFlag = ordner.find(
    (o) => o.elternId === null && lies(o).kind === 'seasonFolder' && lies(o).season === season,
  );
  if (perFlag) return perFlag;

  // Adoptionspfad: von Hand oder von showstopping_tools angelegt.
  return ordner.find((o) => o.elternId === null && passtZuSeason(o.name, season));
}

function findeSzenarioOrdner(
  ordner: OrdnerAbbild[],
  elternId: string,
  schluessel: string,
): OrdnerAbbild | undefined {
  const kinder = ordner.filter((o) => o.elternId === elternId);

  const perFlag = kinder.find((o) => lies(o).scenario === schluessel);
  if (perFlag) return perFlag;

  // Toleranter Namensvergleich: `8-01 Titel` und `08-01 Titel` sind dasselbe,
  // und der Titel darf abweichen — Paizo kuerzt ihn auf dem Umschlag anders
  // als im Satz.
  return kinder.find((o) => schluesselAusOrdnername(o.name) === schluessel);
}

function planeSeasonOrdner(ordnerListe: OrdnerAbbild[], wunsch: Wunsch): OrdnerAktion {
  const vorhanden = findeSeasonOrdner(ordnerListe, wunsch.season);
  if (!vorhanden) {
    return { art: 'anlegen', name: wunsch.seasonOrdnerName, farbe: defaultColorFor(wunsch.season) };
  }

  // Nur die Hausfarbe wird erzwungen. Eine Palettenfarbe waere geraten, und
  // geraten ueberschreibt man nicht, was jemand von Hand gewaehlt hat.
  const offiziell = officialColorFor(wunsch.season);
  if (offiziell && !gleicheFarbe(vorhanden.farbe, offiziell)) {
    return { art: 'umfaerben', id: vorhanden.id, name: vorhanden.name, farbe: offiziell };
  }

  return { art: 'behalten', id: vorhanden.id, name: vorhanden.name };
}

/**
 * Stellt den Plan auf.
 *
 * Der Szenario-Ordner kann nur dann als vorhanden erkannt werden, wenn der
 * Season-Ordner schon existiert — wird der erst angelegt, ist darunter
 * zwangslaeufig noch nichts.
 */
/**
 * Die Farbe, die die Unterordner einer Season tragen sollen: die des
 * Season-Ordners selbst — was auch immer dort steht oder geplant ist.
 */
function seasonFarbe(
  seasonOrdner: OrdnerAktion,
  ordnerListe: OrdnerAbbild[],
  season: number,
): string | undefined {
  if (seasonOrdner.art !== 'behalten') return seasonOrdner.farbe;
  const vorhanden = ordnerListe.find((o) => o.id === seasonOrdner.id);
  return (
    normalisiereFarbe(vorhanden?.farbe) ?? officialColorFor(season) ?? defaultColorFor(season)
  );
}

/**
 * Der Szenario-Unterordner, in der Farbe seiner Season.
 *
 * Ein farbloser vorhandener Ordner wird umgefaerbt; eine von Hand gewaehlte
 * Farbe bleibt — sie ist eine Entscheidung, keine Luecke.
 */
function planeSzenarioOrdner(
  ordnerListe: OrdnerAbbild[],
  wunsch: Wunsch,
  seasonOrdner: OrdnerAktion,
): { aktion: OrdnerAktion; vorhanden: OrdnerAbbild | undefined } {
  const seasonId = seasonOrdner.art === 'anlegen' ? undefined : seasonOrdner.id;
  const vorhanden = seasonId
    ? findeSzenarioOrdner(ordnerListe, seasonId, wunsch.schluessel)
    : undefined;
  const farbe = seasonFarbe(seasonOrdner, ordnerListe, wunsch.season);

  if (!vorhanden) {
    return {
      aktion: {
        art: 'anlegen',
        name: wunsch.szenarioOrdnerName,
        ...(farbe ? { farbe } : {}),
        ...(seasonId ? { elternId: seasonId } : {}),
      },
      vorhanden,
    };
  }

  if (farbe && normalisiereFarbe(vorhanden.farbe) === null) {
    return {
      aktion: { art: 'umfaerben', id: vorhanden.id, name: vorhanden.name, farbe },
      vorhanden,
    };
  }

  return { aktion: { art: 'behalten', id: vorhanden.id, name: vorhanden.name }, vorhanden };
}

export function planeImport(welt: Weltabbild, wunsch: Wunsch): ImportPlan {
  const seasonOrdner = planeSeasonOrdner(welt.ordner, wunsch);

  const { aktion: szenarioOrdner, vorhanden: vorhandenerSzenarioOrdner } = planeSzenarioOrdner(
    welt.ordner,
    wunsch,
    seasonOrdner,
  );

  const vorhandenesJournal = findeJournal(welt, wunsch, vorhandenerSzenarioOrdner?.id);

  const journal = vorhandenesJournal
    ? ({
        art: 'aktualisieren' as const,
        id: vorhandenesJournal.id,
        name: wunsch.journalName,
        alterName: vorhandenesJournal.name,
      })
    : ({ art: 'anlegen' as const, name: wunsch.journalName });

  const anhang = wunsch.anhang
    ? planeAnhang(welt, wunsch, wunsch.anhang, vorhandenerSzenarioOrdner?.id)
    : undefined;

  const szenen =
    wunsch.szenen && wunsch.szenen.length > 0 ? planeSzenen(welt, wunsch, wunsch.szenen) : undefined;

  const kreaturen =
    wunsch.kreaturen && wunsch.kreaturen.length > 0
      ? planeKreaturen(welt, wunsch, wunsch.kreaturen)
      : undefined;

  const effekte =
    wunsch.effekte && wunsch.effekte.length > 0
      ? planeEffekte(welt, wunsch, wunsch.effekte)
      : undefined;

  return {
    seasonOrdner,
    szenarioOrdner,
    journal,
    seiten: planeSeiten(vorhandenesJournal?.seiten ?? [], wunsch.seiten),
    ...(anhang ? { anhang } : {}),
    ...(szenen ? { szenen } : {}),
    ...(kreaturen ? { kreaturen } : {}),
    ...(effekte ? { effekte } : {}),
  };
}

/**
 * Stellt den Plan fuer die Effekte auf — nach demselben Muster wie die
 * Kreaturen: Ordnerbaum je Dokumentart, Abgleich ueber die stabile Kennung,
 * Entfallenes wird nur gemeldet.
 */
function planeEffekte(
  welt: Weltabbild,
  wunsch: Wunsch,
  effekte: EffektWunsch[],
): NonNullable<ImportPlan['effekte']> {
  const ordner = welt.gegenstandsOrdner ?? [];
  const vorhandene = welt.gegenstaende ?? [];

  const seasonOrdner = planeSeasonOrdner(ordner, wunsch);
  const { aktion: szenarioOrdner } = planeSzenarioOrdner(ordner, wunsch, seasonOrdner);

  const vorhandeneIds = new Set(vorhandene.map((eintrag) => eintrag.id));
  const gewuenschteIds = new Set(effekte.map((effekt) => effekt.id));

  const entfallen = vorhandene
    .filter(
      (eintrag) => lies(eintrag).scenario === wunsch.schluessel && !gewuenschteIds.has(eintrag.id),
    )
    .map((eintrag) => eintrag.name);

  return {
    seasonOrdner,
    szenarioOrdner,
    effekte: {
      neu: effekte.filter((e) => !vorhandeneIds.has(e.id)).map((e) => e.name),
      unveraendert: effekte.filter((e) => vorhandeneIds.has(e.id)).map((e) => e.name),
      entfallen,
    },
  };
}

function planeKreaturen(
  welt: Weltabbild,
  wunsch: Wunsch,
  kreaturen: KreaturWunsch[],
): NonNullable<ImportPlan['kreaturen']> {
  const ordner = welt.aktorenOrdner ?? [];
  const vorhandene = welt.aktoren ?? [];

  const seasonOrdner = planeSeasonOrdner(ordner, wunsch);
  const { aktion: szenarioOrdner } = planeSzenarioOrdner(ordner, wunsch, seasonOrdner);

  const vorhandeneIds = new Set(vorhandene.map((aktor) => aktor.id));
  const gewuenschteIds = new Set(kreaturen.map((kreatur) => kreatur.id));

  // Personen ohne Statblock werden getrennt gezaehlt; sonst stuenden sie in
  // derselben Zeile wie die Kreaturen und saehen aus wie welche.
  const mitWerten = kreaturen.filter((k) => k.art !== 'nsc');
  const ohneWerte = kreaturen.filter((k) => k.art === 'nsc');
  const istNeu = (k: KreaturWunsch): boolean => !vorhandeneIds.has(k.id);

  const neu = mitWerten.filter(istNeu).map((k) => k.name);
  const unveraendert = mitWerten.filter((k) => !istNeu(k)).map((k) => k.name);
  const mitBild = mitWerten.filter((k) => istNeu(k) && k.bild !== undefined).map((k) => k.name);
  const nscs = {
    neu: ohneWerte.filter(istNeu).map((k) => k.name),
    unveraendert: ohneWerte.filter((k) => !istNeu(k)).map((k) => k.name),
  };

  // Nur eigene Actors (am Flag erkannt) gelten als entfallen — und auch die
  // werden nur gemeldet, nie geloescht.
  const entfallen = vorhandene
    .filter((aktor) => lies(aktor).scenario === wunsch.schluessel && !gewuenschteIds.has(aktor.id))
    .map((aktor) => aktor.name);

  return {
    seasonOrdner,
    szenarioOrdner,
    kreaturen: { neu, unveraendert, entfallen, mitBild, nscs },
  };
}

function planeSzenen(
  welt: Weltabbild,
  wunsch: Wunsch,
  szenen: SzeneWunsch[],
): NonNullable<ImportPlan['szenen']> {
  const ordner = welt.szenenOrdner ?? [];
  const vorhandene = welt.szenen ?? [];

  const seasonOrdner = planeSeasonOrdner(ordner, wunsch);
  const { aktion: szenarioOrdner } = planeSzenarioOrdner(ordner, wunsch, seasonOrdner);

  // Abgleich ueber die stabile Kennung, wie bei den Journalseiten. Als
  // geaendert gilt nur, was dieser Import selbst setzt — Name, Hintergrund,
  // Messwerte und exportierte Waende. Gitter und Licht unvermessener Karten
  // gehoeren dem Spielleiter.
  const vorhandeneNachId = new Map(vorhandene.map((szene) => [szene.id, szene]));
  const gewuenschteIds = new Set(szenen.map((szene) => szene.id));

  const neu: string[] = [];
  const aktualisiert: string[] = [];
  const unveraendert: string[] = [];

  for (const szene of szenen) {
    const vorher = vorhandeneNachId.get(szene.id);
    if (!vorher) neu.push(szene.name);
    else if (
      vorher.name !== szene.name ||
      vorher.hintergrund !== szene.hintergrund ||
      // Handvermessene Werte zaehlen nur, wenn es welche gibt — eine Karte
      // ohne Eintrag soll die Einstellungen des Spielleiters nicht anfechten.
      (szene.gitter !== undefined &&
        (vorher.gitter !== szene.gitter ||
          vorher.versatzX !== szene.versatzX ||
          vorher.versatzY !== szene.versatzY)) ||
      // Exportierte Waende zaehlen wie die Messwerte: nur wenn es welche
      // gibt, und ein Unterschied macht die Szene aktualisierungsbeduerftig.
      (szene.waende !== undefined &&
        vorher.waendeSignatur !== undefined &&
        vorher.waendeSignatur !== wandSignaturen(szene.waende))
    ) {
      aktualisiert.push(szene.name);
    } else unveraendert.push(szene.name);
  }

  // Nur eigene Szenen (am Flag erkannt) gelten als entfallen — und auch die
  // werden nur gemeldet, nie geloescht.
  const entfallen = vorhandene
    .filter((szene) => lies(szene).scenario === wunsch.schluessel && !gewuenschteIds.has(szene.id))
    .map((szene) => szene.name);

  return {
    seasonOrdner,
    szenarioOrdner,
    szenen: { neu, aktualisiert, unveraendert, entfallen },
  };
}

function planeAnhang(
  welt: Weltabbild,
  wunsch: Wunsch,
  anhang: NonNullable<Wunsch['anhang']>,
  szenarioOrdnerId: string | undefined,
): NonNullable<ImportPlan['anhang']> {
  // Dieselbe Reihenfolge wie beim Hauptjournal: Flag, dann Name im richtigen
  // Ordner, dann neu anlegen.
  const perFlag = welt.journale.find(
    (j) => lies(j).scenario === wunsch.schluessel && lies(j).kind === 'anhangJournal',
  );
  const vorhanden =
    perFlag ??
    (szenarioOrdnerId
      ? welt.journale.find(
          (j) => j.ordnerId === szenarioOrdnerId && j.name === anhang.journalName,
        )
      : undefined);

  return {
    journal: vorhanden
      ? {
          art: 'aktualisieren',
          id: vorhanden.id,
          name: anhang.journalName,
          alterName: vorhanden.name,
        }
      : { art: 'anlegen', name: anhang.journalName },
    seiten: planeSeiten(vorhanden?.seiten ?? [], anhang.seiten),
  };
}

function findeJournal(
  welt: Weltabbild,
  wunsch: Wunsch,
  szenarioOrdnerId: string | undefined,
): JournalAbbild | undefined {
  const perFlag = welt.journale.find(
    (j) => lies(j).scenario === wunsch.schluessel && lies(j).kind === 'journal',
  );
  if (perFlag) return perFlag;

  // Ohne Flag nur im richtigen Ordner und beim richtigen Namen suchen. Ein
  // gleichnamiges Journal irgendwo sonst in der Welt zu uebernehmen waere
  // uebergriffig — dann lieber ein zweites anlegen.
  if (!szenarioOrdnerId) return undefined;
  return welt.journale.find(
    (j) => j.ordnerId === szenarioOrdnerId && j.name === wunsch.journalName,
  );
}

/**
 * Gleicht die Seiten ueber ihre Kennung ab, nicht ueber die Reihenfolge.
 *
 * Die Kennungen sind aus dem Seitennamen abgeleitet und damit ueber Laeufe
 * hinweg stabil. Wer sie behaelt, behaelt auch alle Verweise und Lesezeichen,
 * die im Rest der Welt darauf zeigen.
 */
/**
 * Bringt zwei Fassungen desselben Textes auf eine vergleichbare Form.
 *
 * Foundry entfernt HTML-Kommentare beim Speichern. Die Bildunterschriften
 * stehen als `<!-- Bildunterschrift: ... -->` im erzeugten HTML — was aus der
 * Welt zurueckkommt, ist also nie zeichengleich mit dem, was hineingeschrieben
 * wurde. Ohne diese Angleichung meldet jeder erneute Import genau die Seiten
 * als geaendert, die ein Bild tragen: beim ersten Heft fuenf von fuenfzehn,
 * jedes Mal aufs Neue, ohne dass sich etwas geaendert haette.
 *
 * Verglichen wird damit weniger, geschrieben aber unveraendert viel — die
 * Kommentare bleiben im erzeugten HTML, damit es zeichengleich mit dem des
 * Extractors bleibt. Mit den Bildern in Etappe 3 werden sie ohnehin zu
 * richtigen `<figure>`-Elementen.
 */
function vergleichbar(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((zeile) => zeile.trim() !== '')
    .join('\n');
}

function planeSeiten(alt: SeitenAbbild[], neu: SeitenAbbild[]): ImportPlan['seiten'] {
  const alteNachId = new Map(alt.map((seite) => [seite.id, seite]));
  const neueIds = new Set(neu.map((seite) => seite.id));

  const neuAngelegt: string[] = [];
  const aktualisiert: string[] = [];
  const unveraendert: string[] = [];

  for (const seite of neu) {
    const vorher = alteNachId.get(seite.id);
    if (!vorher) neuAngelegt.push(seite.name);
    else if (
      vorher.name !== seite.name ||
      vergleichbar(vorher.inhalt) !== vergleichbar(seite.inhalt)
    ) {
      aktualisiert.push(seite.name);
    } else unveraendert.push(seite.name);
  }

  const entfallen = alt.filter((seite) => !neueIds.has(seite.id)).map((seite) => seite.name);

  return { neu: neuAngelegt, aktualisiert, unveraendert, entfallen };
}

export { MODULE_ID };
