import { journalDesignAn } from '../settings.ts';
import { SHEET_CLASS } from '../ui/journal-sheet.ts';
import { MODULE_ID, stempel } from './flags.ts';
import { tokenAbschnitt } from './bilder.ts';
import { nscNotiz } from './nscs.ts';
import type {
  EffektWunsch,
  ImportPlan,
  KreaturWunsch,
  SeitenAbbild,
  SzeneWunsch,
} from './plan.ts';
import { wandSignaturen, type Wand } from './waende.ts';

/**
 * Fuehrt einen Plan aus.
 *
 * Bewusst dumm: hier wird nichts entschieden. Alles, was eine Entscheidung
 * ist, steht in `plan.ts` und ist dort ohne Foundry pruefbar. Was hier steht,
 * sind nur die Aufrufe.
 */

/** Ergebnis eines Laufs, fuer die Rueckmeldung an den Anwender. */
export interface Importergebnis {
  journalId: string;
  angelegt: boolean;
  seitenNeu: number;
  seitenAktualisiert: number;
  seitenEntfallen: number;
  /** Bildseiten im Spielhilfen-Journal, falls eines geschrieben wurde. */
  anhangSeiten?: number;
  /** Textseiten im Handout-Journal, falls eines geschrieben wurde. */
  handoutSeiten?: number;
}

export interface AusfuehrOptionen {
  season: number;
  schluessel: string;
  sourceHash?: string;
  toolVersion?: string;
  /**
   * Wie viele Bilddateien der Lauf hochgeladen hat.
   *
   * Die einzige Zahl, die `fuehreAus` nicht selbst kennt — die Dateien gehen
   * am Plan vorbei direkt in Foundrys Datenbaum.
   */
  bilder?: number;
}

async function ordnerId(
  aktion: ImportPlan['seasonOrdner'] | ImportPlan['szenarioOrdner'],
  daten: () => Record<string, unknown>,
): Promise<string> {
  if (aktion.art === 'anlegen') {
    const angelegt = await Folder.create(daten());
    if (!angelegt) throw new Error(`Ordner „${aktion.name}" liess sich nicht anlegen.`);
    return angelegt.id;
  }

  if (aktion.art === 'umfaerben') {
    const ordner = game.folders?.get(aktion.id);
    await ordner?.update({ color: aktion.farbe });
  }

  return aktion.id;
}

export async function fuehreAus(
  plan: ImportPlan,
  seiten: SeitenAbbild[],
  optionen: AusfuehrOptionen,
  anhangSeiten: SeitenAbbild[] = [],
  szenen: SzeneWunsch[] = [],
  kreaturen: KreaturWunsch[] = [],
  effekte: EffektWunsch[] = [],
  handoutSeiten: SeitenAbbild[] = [],
): Promise<Importergebnis> {
  const gemeinsam = {
    season: optionen.season,
    ...(optionen.sourceHash ? { sourceHash: optionen.sourceHash } : {}),
    ...(optionen.toolVersion ? { toolVersion: optionen.toolVersion } : {}),
  };

  const seasonId = await ordnerId(plan.seasonOrdner, () => ({
    name: plan.seasonOrdner.name,
    type: 'JournalEntry',
    // Das Elternfeld heisst `folder`, nicht `parent` — `parent` setzt nichts.
    folder: null,
    sorting: 'a',
    ...(plan.seasonOrdner.art === 'anlegen' && plan.seasonOrdner.farbe
      ? { color: plan.seasonOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'seasonFolder' }),
  }));

  const szenarioId = await ordnerId(plan.szenarioOrdner, () => ({
    name: plan.szenarioOrdner.name,
    type: 'JournalEntry',
    folder: seasonId,
    sorting: 'a',
    ...(plan.szenarioOrdner.art === 'anlegen' && plan.szenarioOrdner.farbe
      ? { color: plan.szenarioOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'scenarioFolder', scenario: optionen.schluessel }),
  }));

  // Die Soll-Zahlen stehen am Hauptjournal — dem einen Dokument, das jedes
  // Szenario hat. Sie sind das Mass, an dem die Vollstaendigkeitsprobe im
  // Verwaltungsfenster spaeter Fehlendes erkennt.
  const flags = stempel({
    ...gemeinsam,
    kind: 'journal',
    scenario: optionen.schluessel,
    soll: {
      seiten: seiten.length,
      anhangSeiten: anhangSeiten.length,
      szenen: szenen.length,
      aktoren: kreaturen.length,
      effekte: effekte.length,
      handoutSeiten: handoutSeiten.length,
      bilder: optionen.bilder ?? 0,
    },
  });

  const ergebnis = await schreibeJournal(
    plan.journal,
    seiten,
    zuSeitendaten,
    szenarioId,
    flags,
    plan.seiten.aktualisiert.length,
  );

  let anhangJournalId: string | undefined;
  if (plan.anhang) {
    const anhangFlags = stempel({
      ...gemeinsam,
      kind: 'anhangJournal',
      scenario: optionen.schluessel,
    });
    const anhangErgebnis = await schreibeJournal(
      plan.anhang.journal,
      anhangSeiten,
      zuBildseitendaten,
      szenarioId,
      anhangFlags,
      plan.anhang.seiten.aktualisiert.length,
      NEBENJOURNAL_RECHTE,
    );
    anhangJournalId = anhangErgebnis.journalId;
    ergebnis.anhangSeiten = anhangSeiten.length;
  }

  if (plan.handouts) {
    await schreibeJournal(
      plan.handouts.journal,
      handoutSeiten,
      zuSeitendaten,
      szenarioId,
      stempel({ ...gemeinsam, kind: 'handoutJournal', scenario: optionen.schluessel }),
      plan.handouts.seiten.aktualisiert.length,
      NEBENJOURNAL_RECHTE,
    );
    ergebnis.handoutSeiten = handoutSeiten.length;
  }

  if (plan.szenen && szenen.length > 0) {
    await schreibeSzenen(plan.szenen, szenen, optionen, gemeinsam);
  }

  if (plan.kreaturen && kreaturen.length > 0) {
    // Die Kennung des Spielhilfen-Journals steht erst jetzt fest — die NSCs
    // verweisen mit ihren Spielleiternotizen darauf zurueck.
    await schreibeKreaturen(plan.kreaturen, kreaturen, optionen, gemeinsam, anhangJournalId);
  }

  if (plan.effekte && effekte.length > 0) {
    await schreibeEffekte(plan.effekte, effekte, optionen, gemeinsam);
  }

  return ergebnis;
}

/**
 * Legt den Ordnerbaum fuer Gegenstaende an und schreibt die Effekte.
 *
 * Wie bei den Kreaturen: Vorhandene werden nicht angefasst, geloescht wird
 * nie. Ein Effekt kann vom Spielleiter angepasst worden sein.
 */
async function schreibeEffekte(
  plan: NonNullable<ImportPlan['effekte']>,
  effekte: EffektWunsch[],
  optionen: AusfuehrOptionen,
  gemeinsam: Record<string, unknown> & { season: number },
): Promise<void> {
  const seasonId = await ordnerId(plan.seasonOrdner, () => ({
    name: plan.seasonOrdner.name,
    type: 'Item',
    folder: null,
    sorting: 'a',
    ...(plan.seasonOrdner.art === 'anlegen' && plan.seasonOrdner.farbe
      ? { color: plan.seasonOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'seasonFolder' }),
  }));

  const szenarioId = await ordnerId(plan.szenarioOrdner, () => ({
    name: plan.szenarioOrdner.name,
    type: 'Item',
    folder: seasonId,
    sorting: 'a',
    ...(plan.szenarioOrdner.art === 'anlegen' && plan.szenarioOrdner.farbe
      ? { color: plan.szenarioOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'scenarioFolder', scenario: optionen.schluessel }),
  }));

  const flags = stempel({ ...gemeinsam, kind: 'effect', scenario: optionen.schluessel });
  const vorhanden = new Set<string>((game.items?.contents ?? []).map((eintrag) => eintrag.id));

  const anzulegen = effekte
    .filter((effekt) => !vorhanden.has(effekt.id))
    .map((effekt) => ({
      ...effekt.daten,
      _id: effekt.id,
      folder: szenarioId,
      flags: { ...(effekt.daten.flags as Record<string, unknown> | undefined), ...flags },
    }));

  if (anzulegen.length > 0) {
    await Item.createDocuments(anzulegen, { keepId: true });
  }
}

/**
 * Das Tokenbild, das der neue Actor behalten soll.
 *
 * Gebraucht wird das nur, weil Foundrys `Actor#_preCreate` in v14 das
 * Tokenbild an `img` koppelt: Ist `prototypeToken.texture.src` leer **oder
 * gleich `CONST.DEFAULT_TOKEN`** und steht `img` in den Anlegedaten, setzt
 * Foundry das Token stillschweigend auf ebendieses `img`. Ein Portraet aus dem
 * Heft landete damit als Token auf der Karte — hochkant und angeschnitten.
 * (Nachgelesen im ausgelieferten `scripts/foundry.mjs` der laufenden Instanz,
 * nicht geraten.)
 *
 * Deshalb wird der Wert hier ausdruecklich gesetzt: das mitgebrachte Tokenbild
 * der Vorlage, sonst der Standard des Systems (`npc.svg`, `hazard.svg`).
 * Aufsichten aus Portraets zu erzeugen ist ein eigener, offener Punkt.
 */
function tokenBild(daten: Record<string, unknown>): string | undefined {
  const token = daten.prototypeToken as { texture?: { src?: unknown } } | undefined;
  const eigenes = token?.texture?.src;
  if (typeof eigenes === 'string' && eigenes !== '' && eigenes !== CONST.DEFAULT_TOKEN) {
    return eigenes;
  }

  const standard = Actor.implementation?.getDefaultArtwork?.({ type: daten.type });
  const src = standard?.texture?.src;
  return typeof src === 'string' && src !== '' ? src : undefined;
}

/**
 * Legt den Actor-Ordnerbaum an und holt die Kreaturen aus den Kompendien.
 *
 * Vorhandene Actors werden nicht angefasst (keine Auffrischung aus dem
 * Kompendium — daran haengt womoeglich Handarbeit des Spielleiters), und
 * geloescht wird nie. Elite und Schwach laufen ueber `applyAdjustment` des
 * PF2e-Systems, nie ueber ein blankes Update — nur die Methode zieht auch
 * die aktuellen Trefferpunkte nach.
 */
async function schreibeKreaturen(
  plan: NonNullable<ImportPlan['kreaturen']>,
  kreaturen: KreaturWunsch[],
  optionen: AusfuehrOptionen,
  gemeinsam: Record<string, unknown> & { season: number },
  anhangJournalId?: string,
): Promise<void> {
  const seasonId = await ordnerId(plan.seasonOrdner, () => ({
    name: plan.seasonOrdner.name,
    type: 'Actor',
    folder: null,
    sorting: 'a',
    ...(plan.seasonOrdner.art === 'anlegen' && plan.seasonOrdner.farbe
      ? { color: plan.seasonOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'seasonFolder' }),
  }));

  const szenarioId = await ordnerId(plan.szenarioOrdner, () => ({
    name: plan.szenarioOrdner.name,
    type: 'Actor',
    folder: seasonId,
    sorting: 'a',
    ...(plan.szenarioOrdner.art === 'anlegen' && plan.szenarioOrdner.farbe
      ? { color: plan.szenarioOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'scenarioFolder', scenario: optionen.schluessel }),
  }));

  const flags = stempel({ ...gemeinsam, kind: 'actor', scenario: optionen.schluessel });
  const vorhanden = new Set<string>((game.actors?.contents ?? []).map((aktor) => aktor.id));

  for (const kreatur of kreaturen) {
    if (vorhanden.has(kreatur.id)) continue;

    // Zwei Herkuenfte, ein Weg: Eine Kreatur wird aus dem Kompendium kopiert,
    // eine szenarioeigene Gefahr bringt ihre Daten fertig mit. Alles danach —
    // Ordner, Name, Flags, Kennung — ist fuer beide gleich.
    let daten: Record<string, unknown>;
    if (kreatur.daten) {
      daten = { ...kreatur.daten };
    } else if (kreatur.uuid) {
      const quelle = (await foundry.utils.fromUuid(kreatur.uuid)) as FoundryCompendiumActor | null;
      if (!quelle) {
        console.warn(`${MODULE_ID} | Kompendiumseintrag fehlt: ${kreatur.uuid}`);
        continue;
      }
      daten = quelle.toObject();
    } else {
      console.warn(`${MODULE_ID} | „${kreatur.name}" hat weder Vorlage noch Daten.`);
      continue;
    }
    delete daten['_id'];

    // Der Rueckverweis eines NSC auf seine Bildseite. Er entsteht erst hier,
    // weil die Kennung des Spielhilfen-Journals vor dem Schreiben nicht
    // feststeht. Ohne Journal bleibt das Feld leer — der Actor ist trotzdem
    // brauchbar.
    if (kreatur.journalSeite && anhangJournalId) {
      const system = (daten.system ?? {}) as Record<string, unknown>;
      const details = (system.details ?? {}) as Record<string, unknown>;
      daten.system = {
        ...system,
        details: {
          ...details,
          privateNotes: nscNotiz(anhangJournalId, kreatur.journalSeite, kreatur.name),
        },
      };
    }

    // Das Token baut `bilder.ts` — dort ist es ohne Foundry pruefbar. Von
    // hier kommen nur die zwei Dinge, die Foundry weiss: die Vorlage und der
    // Standardwert des Systems.
    const tokenStandard = kreatur.bild ? tokenBild(daten) : undefined;
    const angelegt = await Actor.create(
      {
        ...daten,
        _id: kreatur.id,
        // Actor und Token tragen den Namen des Statblocks, nicht den der
        // Vorlage — eine Variante heisst `Captain Ashfell Grimme`, auch wenn
        // darunter der Pirat aus dem Grundwerk steckt.
        name: kreatur.name,
        // Das Portraet aus dem Heft schlaegt das graue Standardsymbol des
        // Systems. Nur beim Anlegen — ein vorhandener Actor bleibt unberuehrt.
        ...(kreatur.bild ? { img: kreatur.bild } : {}),
        prototypeToken: tokenAbschnitt(
          kreatur,
          daten.prototypeToken as Record<string, unknown> | undefined,
          tokenStandard,
        ),
        folder: szenarioId,
        // Die eigenen Flags kommen zu denen der Vorlage dazu, sie ersetzen
        // sie nicht — das PF2e-System traegt dort Eigenes.
        flags: { ...(daten.flags as Record<string, unknown> | undefined), ...flags },
      },
      { keepId: true },
    );
    if (!angelegt) {
      console.warn(`${MODULE_ID} | Kreatur „${kreatur.name}" liess sich nicht anlegen.`);
      continue;
    }

    if (kreatur.anpassung && typeof angelegt.applyAdjustment === 'function') {
      await angelegt.applyAdjustment(kreatur.anpassung);
    }
  }
}

/**
 * Legt den Szenen-Ordnerbaum an und gleicht die Szenen ab.
 *
 * Aktualisiert werden Name, Hintergrund, Ordner, Messwerte und exportierte
 * Waende — Gitter und Licht unvermessener Karten gehoeren dem Spielleiter. Geloescht wird nie; der Plan meldet
 * Entfallenes nur.
 */
async function schreibeSzenen(
  plan: NonNullable<ImportPlan['szenen']>,
  szenen: SzeneWunsch[],
  optionen: AusfuehrOptionen,
  gemeinsam: Record<string, unknown> & { season: number },
): Promise<void> {
  const seasonId = await ordnerId(plan.seasonOrdner, () => ({
    name: plan.seasonOrdner.name,
    type: 'Scene',
    folder: null,
    sorting: 'a',
    ...(plan.seasonOrdner.art === 'anlegen' && plan.seasonOrdner.farbe
      ? { color: plan.seasonOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'seasonFolder' }),
  }));

  const szenarioId = await ordnerId(plan.szenarioOrdner, () => ({
    name: plan.szenarioOrdner.name,
    type: 'Scene',
    folder: seasonId,
    sorting: 'a',
    ...(plan.szenarioOrdner.art === 'anlegen' && plan.szenarioOrdner.farbe
      ? { color: plan.szenarioOrdner.farbe }
      : {}),
    flags: stempel({ ...gemeinsam, kind: 'scenarioFolder', scenario: optionen.schluessel }),
  }));

  const flags = stempel({ ...gemeinsam, kind: 'scene', scenario: optionen.schluessel });
  const vorhanden = new Set<string>((game.scenes?.contents ?? []).map((szene) => szene.id));

  const anzulegen = szenen
    .filter((szene) => !vorhanden.has(szene.id))
    .map((szene) => ({
      _id: szene.id,
      name: szene.name,
      folder: szenarioId,
      // Der Versatz der Karte heisst am Dokument `shift`, im Dialog steht er
      // unter „Scene Properties" — nicht zu verwechseln mit den
      // Textur-Offsets der Ebene, die das Gitterwerkzeug nicht anfasst.
      shiftX: szene.versatzX ?? 0,
      shiftY: szene.versatzY ?? 0,
      // Niedrig aufgeloeste Karten bekommen die doppelte Leinwand; Foundry
      // zieht den Hintergrund auf die Szenengroesse auf.
      width: Math.round(szene.breite * (szene.skalierung ?? 1)),
      height: Math.round(szene.hoehe * (szene.skalierung ?? 1)),
      padding: 0,
      // Das Raster ist auf der Karte aufgedruckt — Foundrys Linien darueber
      // waeren doppelt.
      grid: { alpha: 0, ...(szene.gitter !== undefined ? { size: szene.gitter } : {}) },
      navigation: false,
      flags,
    }));

  if (anzulegen.length) {
    await Scene.createDocuments(anzulegen, { keepId: true });
  }

  // Hintergrundbild und -farbe leben seit v14 in der **Ebene** der Szene —
  // Felder am Szenen-Dokument werden dafuer stillschweigend verworfen (so
  // entstanden Szenen ohne Bild). Foundry legt beim Anlegen selbst eine
  // Standardebene an; die bekommt hier Bild und schwarzen Grund.
  for (const szene of szenen) {
    const dokument = game.scenes?.get(szene.id);
    if (!dokument || vorhanden.has(szene.id)) continue;
    await schreibeEbene(dokument, szene.hintergrund);
  }

  // Vorhandene Szenen nur anfassen, wenn sich an **unseren** Feldern etwas
  // geaendert hat — dieselbe Pruefung wie im Plan, hier am lebenden Dokument.
  for (const szene of szenen) {
    if (!vorhanden.has(szene.id)) continue;
    const dokument = game.scenes?.get(szene.id);
    if (!dokument) continue;

    const hintergrund = dokument.levels?.contents?.[0]?.background?.src ?? '';
    const vermessen =
      szene.gitter !== undefined &&
      (dokument.grid?.size !== szene.gitter ||
        dokument.shiftX !== szene.versatzX ||
        dokument.shiftY !== szene.versatzY);
    if (dokument.name === szene.name && hintergrund === szene.hintergrund && !vermessen) {
      continue;
    }

    await dokument.update({
      name: szene.name,
      ...(szene.versatzX !== undefined ? { shiftX: szene.versatzX } : {}),
      ...(szene.versatzY !== undefined ? { shiftY: szene.versatzY } : {}),
      ...(szene.gitter !== undefined ? { grid: { size: szene.gitter, alpha: 0 } } : {}),
      width: Math.round(szene.breite * (szene.skalierung ?? 1)),
      height: Math.round(szene.hoehe * (szene.skalierung ?? 1)),
      folder: szenarioId,
      flags,
    });
    await schreibeEbene(dokument, szene.hintergrund);
  }

  // Waende zuletzt, fuer neue wie vorhandene Szenen gleichermassen — und
  // unabhaengig davon, ob sich oben an der Szene etwas geaendert hat.
  for (const szene of szenen) {
    const dokument = game.scenes?.get(szene.id);
    if (dokument) await gleicheWaendeAb(dokument, szene.waende);
  }
}

/**
 * Ersetzt die Waende einer Szene durch die exportierten aus dem Repo — nur
 * wenn es fuer die Karte ueberhaupt eine Wanddatei gibt, und nur bei
 * Abweichung. Karten ohne Wanddatei bleiben unberuehrt; dort duerfen
 * handgezeichnete Waende weiterleben. Liegt eine Datei vor, ist das Repo
 * die Quelle: von Hand nachgezogene Waende werden beim naechsten Lauf
 * ersetzt, dafuer gibt es den Export (`tools/exportiere-waende.mjs`).
 */
async function gleicheWaendeAb(dokument: FoundryScene, waende?: Wand[]): Promise<void> {
  if (!waende) return;
  const vorhanden = dokument.walls?.contents ?? [];
  if (vorhanden.length > 0 && wandSignaturen(vorhanden) === wandSignaturen(waende)) return;

  // `deleteAll` statt einer Id-Liste: Am 13.08.2026 verdoppelten sich
  // Waende, weil die Sammlung hier leer aussah, obwohl die Szene welche
  // hatte — die Id-Liste loeschte dann nichts, und die neuen kamen obendrauf.
  // `deleteAll` raeumt serverseitig ab und haengt nicht an dieser Sicht.
  await dokument.deleteEmbeddedDocuments('Wall', [], { deleteAll: true });
  if (waende.length > 0) {
    await dokument.createEmbeddedDocuments('Wall', waende);
  }

  // Zuruecklesen statt vertrauen: Stimmt die Zahl danach nicht, soll das im
  // Protokoll stehen und nicht erst am Spieltisch auffallen.
  const danach = dokument.walls?.contents?.length ?? 0;
  if (danach !== waende.length) {
    console.warn(
      `${MODULE_ID} | Szene „${dokument.name}": ${waende.length} Waende geschrieben, ` +
        `aber ${danach} zurueckgelesen.`,
    );
  }
}

/** Setzt Bild und schwarzen Grund auf die erste Ebene der Szene. */
async function schreibeEbene(dokument: FoundryScene, hintergrund: string): Promise<void> {
  const ebene = dokument.levels?.contents?.[0];
  if (!ebene) return;
  await dokument.updateEmbeddedDocuments('Level', [
    // Der Rand um die Karte soll nicht leuchten — daher Schwarz statt des
    // Foundry-Graus.
    { _id: ebene.id, background: { src: hintergrund, color: '#000000' } },
  ]);

  // Das Vorschaubild entsteht nicht von selbst: Foundry erneuert es nur beim
  // Speichern ueber das Einstellungsfenster. Ohne diesen Schritt blieben die
  // Kacheln in der Seitenleiste schwarz — auch nach jedem spaeteren
  // Bildwechsel.
  try {
    const { thumb } = await dokument.createThumbnail();
    await dokument.update({ thumb });
  } catch (fehler) {
    console.warn(`${MODULE_ID} | Vorschaubild fuer „${dokument.name}" fehlgeschlagen`, fehler);
  }
}

/**
 * Ergaenzt `flags.core.sheetClass`, damit das Journal das eigene Blatt des
 * Moduls nutzt — aber nur, wenn die Einstellung an ist und noch kein Blatt
 * gewaehlt wurde. Eine ausdrueckliche Wahl im Blatt-Dialog (irgendein
 * nicht-leerer Wert, auch ein fremdes Blatt) bleibt bei jedem Lauf stehen.
 */
function mitJournalBlatt(
  flags: Record<string, Record<string, unknown>>,
  bisherigeKernFlags?: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  if (!journalDesignAn()) return flags;
  const gewaehlt =
    typeof bisherigeKernFlags?.sheetClass === 'string' && bisherigeKernFlags.sheetClass !== '';
  if (gewaehlt) return flags;
  return { ...flags, core: { sheetClass: SHEET_CLASS } };
}

/** Rechte eines Journals und seiner Seiten, als Stufe fuer `ownership.default`. */
interface Journalrechte {
  journal: number;
  seite: number;
}

/**
 * Rechte der Journale neben dem Hauptjournal — Spielhilfen und Handouts.
 *
 * Das Journal steht auf „Observer", damit die Spieler es oeffnen koennen;
 * jede Seite steht auf „None", damit sie erst erscheint, wenn der Spielleiter
 * sie einzeln freigibt. Foundrys Vorgabe ist die Umkehrung — Journal „None",
 * Seiten „Inherit" — und damit sehen die Spieler entweder nichts oder, sobald
 * der Spielleiter das Journal freigibt, alle Seiten auf einmal.
 *
 * Die Stufen sind `CONST.DOCUMENT_OWNERSHIP_LEVELS` (v14, nachgelesen in
 * `foundry-vtt-types`): NONE ist 0, OBSERVER ist 2. Als Zahl, weil der Shim
 * die Konstante nicht fuehrt und `effekte.ts` es ebenso haelt.
 */
const NEBENJOURNAL_RECHTE: Journalrechte = { journal: 2, seite: 0 };

/**
 * Legt ein Journal an oder gleicht seine Seiten ab — Haupt-, Spielhilfen-
 * und Handout-Journal laufen durch denselben Weg, nur die Seitenform ist
 * eine andere (Text gegen Bild).
 *
 * Mit `rechte` bekommen Journal und Seiten feste Stufen in `ownership.default`,
 * auch beim Abgleich eines vorhandenen Journals. Ohne `rechte` bleibt es bei
 * Foundrys Vorgabe, und ein Abgleich laesst die Rechte unangetastet — das
 * Hauptjournal gehoert dem Spielleiter, wie bisher.
 */
async function schreibeJournal(
  aktion:
    | { art: 'anlegen'; name: string; id?: string }
    | { art: 'aktualisieren'; id: string; name: string; alterName: string },
  seiten: SeitenAbbild[],
  zuDaten: (seite: SeitenAbbild) => Record<string, unknown>,
  ordnerId: string,
  flags: Record<string, Record<string, unknown>>,
  aktualisiertLautPlan: number,
  rechte?: Journalrechte,
): Promise<Importergebnis> {
  // `ownership` als Teilobjekt: Foundry mischt es beim `update` in den Bestand
  // ein, Eintraege fuer einzelne Spieler bleiben so stehen.
  const journalRechte = rechte ? { ownership: { default: rechte.journal } } : {};
  const seitendaten = (seite: SeitenAbbild): Record<string, unknown> =>
    rechte ? { ...zuDaten(seite), ownership: { default: rechte.seite } } : zuDaten(seite);

  if (aktion.art === 'anlegen') {
    const alleFlags = mitJournalBlatt(flags);
    // Eine vom Plan vergebene Kennung wird uebernommen: Der Haupttext kann
    // dann schon auf Seiten dieses Journals verweisen, bevor es existiert.
    const angelegt = await JournalEntry.create(
      {
        ...(aktion.id !== undefined ? { _id: aktion.id } : {}),
        name: aktion.name,
        folder: ordnerId,
        pages: seiten.map(seitendaten),
        flags: alleFlags,
        ...journalRechte,
      },
      aktion.id !== undefined ? { keepId: true } : undefined,
    );
    if (!angelegt) throw new Error(`Journal „${aktion.name}" liess sich nicht anlegen.`);

    return {
      journalId: angelegt.id,
      angelegt: true,
      seitenNeu: seiten.length,
      seitenAktualisiert: 0,
      seitenEntfallen: 0,
    };
  }

  const journal = game.journal?.get(aktion.id);
  if (!journal) throw new Error(`Journal ${aktion.id} ist verschwunden.`);

  await journal.update({
    name: aktion.name,
    folder: ordnerId,
    flags: mitJournalBlatt(flags, journal.flags?.core),
    ...journalRechte,
  });

  // Seiten ueber ihre Kennung abgleichen. Wer die Kennungen behaelt, behaelt
  // auch die Verweise und Lesezeichen, die anderswo darauf zeigen.
  // `pages` ist eine eingebettete Sammlung, kein Feld — `.contents` gibt das
  // Feld dazu.
  const vorhanden = new Set<string>((journal.pages?.contents ?? []).map((seite) => seite.id));
  const gewuenscht = new Set(seiten.map((seite) => seite.id));

  const anzulegen = seiten.filter((seite) => !vorhanden.has(seite.id)).map(seitendaten);
  const zuAendern = seiten
    .filter((seite) => vorhanden.has(seite.id))
    .map((seite) => ({ _id: seite.id, ...seitendaten(seite) }));
  const zuLoeschen = [...vorhanden].filter((id) => !gewuenscht.has(id));

  if (anzulegen.length) {
    await journal.createEmbeddedDocuments('JournalEntryPage', anzulegen, { keepId: true });
  }
  if (zuAendern.length) await journal.updateEmbeddedDocuments('JournalEntryPage', zuAendern);
  if (zuLoeschen.length) await journal.deleteEmbeddedDocuments('JournalEntryPage', zuLoeschen);

  return {
    journalId: journal.id,
    angelegt: false,
    seitenNeu: anzulegen.length,
    seitenAktualisiert: aktualisiertLautPlan,
    seitenEntfallen: zuLoeschen.length,
  };
}

function zuSeitendaten(seite: SeitenAbbild): Record<string, unknown> {
  return {
    _id: seite.id,
    name: seite.name,
    type: 'text',
    title: { show: false, level: seite.level ?? 1 },
    text: { format: 1, content: seite.inhalt },
    sort: seite.sort ?? 0,
  };
}

/**
 * Eine Seite des Spielhilfen-Journals: eine Bildseite, `inhalt` traegt den
 * Dateipfad — oder, mit `art: 'text'`, eine Krankheitsseite.
 */
function zuBildseitendaten(seite: SeitenAbbild): Record<string, unknown> {
  if (seite.art === 'text') return zuSeitendaten(seite);
  return {
    _id: seite.id,
    name: seite.name,
    type: 'image',
    title: { show: true, level: seite.level ?? 1 },
    src: seite.inhalt,
    sort: seite.sort ?? 0,
  };
}

export { MODULE_ID };
