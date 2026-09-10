import type { ActorIndex } from '../pdf/actors.ts';
import { WeltActorSuche } from '../pdf/actors.ts';
import {
  buildPages,
  foundryId,
  seitenKennung,
  type GefundeneKreatur,
  type OhneVorlage,
} from '../pdf/journal.ts';
import type { Scenario } from '../pdf/scenario.ts';
import { fuehreAus, type Importergebnis } from './apply.ts';
import {
  bildFuerKreatur,
  fuegeFigurenEin,
  tokenAusPortraet,
  type BildFuerSeiten,
  type PersonenBild,
} from './bilder.ts';
import { kartenEinstellung } from './karten-einstellungen.ts';
import { kartenWaende, wandSignaturen } from './waende.ts';
import { lies } from './flags.ts';
import { journalName, quellenangabe, scenarioFolderName, scenarioKey, seasonFolderName, type JournalNameSchema } from './naming.ts';
import { baueGefahr, type Schluesselwerke } from './gefahren.ts';
import { baueNsc, sammleNscs } from './nscs.ts';
import { sammleEffekte } from '../pdf/effekte.ts';
import { sammleHandouts } from '../pdf/handouts.ts';
import { baueEffekt, effektName, fuegeEffektVerweiseEin } from './effekte.ts';
import { sammleKrankheiten } from '../pdf/krankheiten.ts';
import {
  fuegeKrankheitVerweiseEin,
  krankheitSeiteHtml,
  krankheitSeitenName,
} from './krankheiten.ts';
import {
  planeImport,
  type EffektWunsch,
  type ImportPlan,
  type KreaturWunsch,
  type SeitenAbbild,
  type Weltabbild,
  type Wunsch,
} from './plan.ts';

/**
 * Der Weg vom gelesenen Szenario in die Welt.
 *
 * Zweigeteilt und in dieser Reihenfolge: erst `plane`, das nichts anfasst und
 * dessen Ergebnis der Dialog zeigen kann, dann `schreibe`. Wer beides in einem
 * Aufruf haette, koennte dem Anwender nicht sagen, was gleich passiert.
 */

const FIRST_SORT = 500;
const SORT_STEP = 100;
/**
 * Name des Handout-Journals. Bewusst der englische Fachbegriff, wie
 * „Season" und „Hazard" in der Oberflaeche — und in beiden Sprachen gleich,
 * damit der zweite Lauf das Journal auch ueber den Namen wiederfindet.
 */
const HANDOUT_JOURNAL = 'Handouts';

/** Liest den Weltbestand in die reine Form, mit der `plan.ts` rechnet. */
export function weltabbild(): Weltabbild {
  const alsAbbild = (f: FoundryFolder): Weltabbild['ordner'][number] => ({
    id: f.id,
    name: f.name,
    elternId: f.folder?.id ?? null,
    farbe: f.color,
    flags: f.flags,
  });

  const ordner = (game.folders?.filter((f) => f.type === 'JournalEntry') ?? []).map(alsAbbild);
  const szenenOrdner = (game.folders?.filter((f) => f.type === 'Scene') ?? []).map(alsAbbild);
  const aktorenOrdner = (game.folders?.filter((f) => f.type === 'Actor') ?? []).map(alsAbbild);
  const gegenstandsOrdner = (game.folders?.filter((f) => f.type === 'Item') ?? []).map(alsAbbild);

  const gegenstaende = (game.items?.contents ?? []).map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    ordnerId: eintrag.folder?.id ?? null,
    flags: eintrag.flags,
  }));

  const aktoren = (game.actors?.contents ?? []).map((aktor) => ({
    id: aktor.id,
    name: aktor.name,
    ordnerId: aktor.folder?.id ?? null,
    flags: aktor.flags,
  }));

  // Hintergrundbild und -farbe leben seit v14 in der Ebene der Szene; der
  // Versatz („Shift") steht dagegen am Szenen-Dokument selbst.
  const szenen = (game.scenes?.contents ?? []).map((szene) => ({
    id: szene.id,
    name: szene.name,
    ordnerId: szene.folder?.id ?? null,
    hintergrund: szene.levels?.contents?.[0]?.background?.src ?? '',
    ...(szene.grid?.size !== undefined ? { gitter: szene.grid.size } : {}),
    ...(szene.shiftX !== undefined ? { versatzX: szene.shiftX } : {}),
    ...(szene.shiftY !== undefined ? { versatzY: szene.shiftY } : {}),
    waendeSignatur: wandSignaturen(szene.walls?.contents ?? []),
    flags: szene.flags,
  }));

  const journale = (game.journal?.contents ?? []).map((j) => ({
    id: j.id,
    name: j.name,
    ordnerId: j.folder?.id ?? null,
    flags: j.flags,
    seiten: (j.pages?.contents ?? []).map((seite) => ({
      id: seite.id,
      name: seite.name,
      // Bei Bildseiten steht der Dateipfad an der Stelle des Inhalts —
      // derselbe Abgleich traegt dann beide Seitenformen.
      inhalt: seite.text?.content ?? seite.src ?? '',
    })),
  }));

  return {
    ordner,
    journale,
    szenenOrdner,
    szenen,
    aktorenOrdner,
    aktoren,
    gegenstandsOrdner,
    gegenstaende,
  };
}

export interface Vorhaben {
  wunsch: Wunsch;
  plan: ImportPlan;
  seiten: SeitenAbbild[];
  schluessel: string;
  season: number;
  sourceHash?: string;
  /** Wie viele Bilder als `<figure>` in den Seiten stehen. */
  bilderEingebettet: number;
  /**
   * Wie viele Effekte im Journaltext verlinkt werden konnten, und wie viele
   * es insgesamt gibt. Gehen die Zahlen auseinander, wurde ein Satz im
   * erzeugten HTML nicht wiedergefunden — das gehoert in die Vorschau.
   */
  effekteVerlinkt: number;
  /**
   * Die Krankheiten des Hefts: Seitennamen im Spielhilfen-Journal, und wie
   * viele davon im Haupttext verlinkt werden konnten.
   */
  krankheiten: { seiten: string[]; verlinkt: number };
  /**
   * Wie viele Bilddateien der Lauf hochlaedt — die Soll-Zahl fuer die
   * Vollstaendigkeitsprobe. Sie zaehlt alle Sorten, auch die Karten.
   */
  bilderGesamt: number;
  /**
   * Was beim Bauen der Gefahren nicht untergebracht werden konnte, je Eintrag
   * mit dem Namen der Gefahr davor.
   *
   * Gehoert in die Vorschau: Die Gefahr entstuende auch ohne diese Zeile, saehe
   * richtig aus und waere an einer Stelle falsch, die niemand nachprueft.
   */
  gefahrenReste: string[];
}

/**
 * Stellt fest, was geschehen wuerde. Fasst nichts an.
 *
 * Ohne erkannte Kennung geht es nicht weiter: Ordner, Journalname und die
 * Wiedererkennung beim zweiten Lauf haengen alle daran. Lieber abbrechen als
 * etwas an einen Ort legen, an dem es niemand wiederfindet.
 */
export function plane(
  szenario: Scenario,
  optionen: {
    schema?: JournalNameSchema;
    sourceHash?: string;
    /**
     * Mit Actor-Index bekommen die Statblock-Leisten ihren Verweis. Die
     * entstehen nicht im Fliesstext, sondern an den Ueberschriften — deshalb
     * sind sie nicht Teil von `reichereAn`, sondern gehen hier hinein.
     */
    actors?: ActorIndex;
    /**
     * Bilder mit ihren Ablagepfaden. Sie gehen **vor** dem Weltvergleich in
     * die Seiten — sonst meldete der Plan Seiten als unveraendert, die beim
     * Schreiben doch ein `<figure>` bekaemen.
     */
    bilder?: BildFuerSeiten[];
    /** Das Spielhilfen-Journal: Titel und die Bilder seiner Bildseiten. */
    anhang?: { titel: string; bilder: { file: string; name?: string; pfad: string }[] };
    /** Die Karten, aus denen Szenen werden sollen. */
    karten?: { file: string; name?: string; pfad: string; breite: number; hoehe: number }[];
    /**
     * Die benannten Personenbilder. Traegt eines den Namen eines Statblocks,
     * wird es das Bild des Actors; die uebrigen aus dem Anhang koennen zu
     * NSC-Actors werden.
     */
    personen?: PersonenBild[];
    /**
     * Sollen die Personen ohne Statblock als NSC-Actors entstehen?
     *
     * Aus bleiben sie ein Bild im Spielhilfen-Journal, wie bisher.
     */
    nscActors?: boolean;
    /**
     * Sollen Actors mit Portraet einen dynamischen Token-Ring bekommen?
     *
     * Aus bleibt das Portraet trotzdem das Token — der Ring ist die
     * Verzierung, der Bildtausch der Zweck.
     */
    tokenRinge?: boolean;
    /**
     * Sollen die Zusagen des Hefts (Boni und Mali fuer die Gruppe) als
     * Effekt-Gegenstaende entstehen?
     */
    effekte?: boolean;
    /** Die eingesammelten Kreaturen; jede Fassung wird ein Welt-Actor. */
    kreaturen?: GefundeneKreatur[];
    /**
     * Angeglichene Actordaten je Kreatur, aus `pruefeKreaturen`.
     *
     * Wo eine steht, wird sie angelegt statt der blossen Kompendium-Kopie.
     * Fehlt sie, weicht der Statblock nicht ab — oder der Angleich ist
     * abgeschaltet.
     */
    angleiche?: ReadonlyMap<GefundeneKreatur, Record<string, unknown>>;
    /**
     * Statbloecke ohne Kompendium-Vorlage. Gefahren darunter werden gebaut,
     * alles andere bleibt eine Meldung.
     */
    ohneVorlage?: OhneVorlage[];
    /**
     * Die Schluessel, die das PF2e-System kennt (`CONFIG.PF2E`).
     *
     * Sie kommen von aussen herein, weil diese Schicht Foundry nicht kennen
     * darf. Fehlen sie, wird beim Bau nicht geprueft.
     */
    gefahrenWerke?: Schluesselwerke;
    /** Wohin die Kreaturverweise im Journal zeigen sollen. */
    kreaturVerweise?: 'kompendium' | 'welt';
  } = {},
): Vorhaben | undefined {
  const designation = szenario.designation;
  if (!designation) return undefined;

  // Die Kennung einer Kreatur haengt an Vorlage **und** Namen: derselbe
  // Twigjack in zwei Szenarien bleibt getrennt (der Titel steckt im Samen),
  // Elite und Grundform ebenso — und zwei Varianten derselben Vorlage auch.
  const kreaturen: KreaturWunsch[] = (optionen.kreaturen ?? []).map((kreatur) => {
    // Die Kennung haengt **nicht** davon ab, ob angeglichen wurde: Sonst
    // bekaeme dieselbe Kreatur eine andere Kennung, sobald der Spielleiter die
    // Einstellung umlegt, und der zweite Import legte sie ein zweites Mal an.
    const angeglichen = optionen.angleiche?.get(kreatur);
    // Das Bild geht ebenfalls nicht in die Kennung ein: Es haengt daran, ob
    // der Bilderlauf lief und eine Bildwurzel gesetzt ist.
    const bild = bildFuerKreatur(kreatur.name, optionen.personen ?? []);
    const token = tokenAusPortraet(kreatur.art, bild, optionen.tokenRinge === true);
    return {
      id: foundryId(
        `${szenario.title}/actor/${kreatur.entry.pack}/${kreatur.entry.id}/${kreatur.anpassung ?? ''}/${kreatur.name}`,
      ),
      name: kreatur.name,
      uuid: `Compendium.${kreatur.entry.pack}.Actor.${kreatur.entry.id}`,
      ...(angeglichen ? { daten: angeglichen } : {}),
      ...(bild ? { bild } : {}),
      ...(token ? { tokenBild: token.bild, ring: token.ring } : {}),
      ...(kreatur.anpassung ? { anpassung: kreatur.anpassung } : {}),
      ...(kreatur.variante ? { variante: kreatur.variante } : {}),
      stufe: kreatur.stufe,
      art: kreatur.art,
    };
  });

  // Gefahren ohne Vorlage werden gebaut statt kopiert. Sie reihen sich in
  // dieselbe Liste ein: Ordnerbaum, Flags, Kennung, Vorschau und das Entfernen
  // gelten fuer sie unveraendert — nur die Herkunft der Daten ist eine andere.
  //
  // Der Samen fuehrt `gebaut` statt einer Vorlagenkennung. Ohne das bekaeme
  // eine gebaute Gefahr dieselbe Kennung wie eine gleichnamige kopierte.
  const gefahrenReste: string[] = [];
  for (const eintrag of optionen.ohneVorlage ?? []) {
    if (eintrag.art !== 'hazard' || !eintrag.statblock) continue;
    const { daten, ungenutzt } = baueGefahr(
      eintrag.statblock,
      optionen.gefahrenWerke ?? {},
      quellenangabe(designation, szenario.title),
    );
    for (const punkt of ungenutzt) gefahrenReste.push(`${eintrag.name}: ${punkt}`);
    const bild = bildFuerKreatur(eintrag.name, optionen.personen ?? []);
    kreaturen.push({
      id: foundryId(`${szenario.title}/actor/gebaut/${eintrag.name}`),
      name: eintrag.name,
      daten,
      ...(bild ? { bild } : {}),
      stufe: eintrag.statblock.stufe,
      art: 'hazard',
    });
  }

  // Auf Wunsch zeigen die Verweise im Journal auf die Welt-Actors statt auf
  // die Kompendien. Das geht **vor** dem Anlegen: die Kennungen sind aus dem
  // Samen abgeleitet und stehen fest, bevor die Actors existieren.
  const verweise =
    optionen.kreaturVerweise === 'welt' && kreaturen.length > 0
      ? new WeltActorSuche(
          // Ohne die NSCs — sie stehen ohnehin erst weiter unten in der Liste,
          // und ein Verweis im Text kann nie auf sie zeigen.
          kreaturen.flatMap((kreatur) =>
            kreatur.art === 'nsc'
              ? []
              : [
                  {
                    name: kreatur.name,
                    stufe: kreatur.stufe,
                    art: kreatur.art,
                    uuid: `Actor.${kreatur.id}`,
                  },
                ],
          ),
        )
      : optionen.actors;

  // Die Kennung haengt am Namen, nicht an der Position — eine eingefuegte
  // Seite verschiebt die anderen nicht mehr (`seitenKennung`). Die
  // heruntergeladene journal.json behaelt die alte Ableitung und bleibt
  // zeichengleich mit dem Extractor; der Weltbestand geht hier bewusst
  // eigene Wege. Beim ersten Import nach dieser Umstellung gelten deshalb
  // einmalig alle Seiten als neu.
  const benannt = new Map<string, number>();
  const seiten = buildPages(szenario, verweise).map((seite, index) => {
    const nth = benannt.get(seite.name) ?? 0;
    benannt.set(seite.name, nth + 1);
    return {
      id: seitenKennung(szenario.title, seite.name, nth),
      name: seite.name,
      inhalt: seite.html,
      level: seite.level,
      sort: FIRST_SORT + index * SORT_STEP,
    };
  });

  const bilderEingebettet = fuegeFigurenEin(seiten, optionen.bilder ?? []);

  // Die Zusagen des Hefts. Sie entstehen **nach** den Seiten, weil ihr
  // Verweis in den fertigen Text gesetzt wird — und vor dem Wunsch, weil die
  // Kennungen dort gebraucht werden.
  const schluesselFuerEffekte = scenarioKey(designation);
  const effekte: EffektWunsch[] = optionen.effekte
    ? sammleEffekte(szenario.blocks).map((effekt) => ({
        id: foundryId(`${szenario.title}/effekt/${effekt.satz}`),
        name: effektName(effekt, schluesselFuerEffekte),
        satz: effekt.satz,
        daten: baueEffekt(
          effekt,
          schluesselFuerEffekte,
          quellenangabe(designation, szenario.title),
        ),
      }))
    : [];

  const effekteVerlinkt = fuegeEffektVerweiseEin(seiten, effekte);

  // Die Kennungen der Bildseiten haengen am Dateinamen, nicht an der
  // Reihenfolge — ein Bild mehr im naechsten Lauf verschiebt die anderen
  // nicht.
  const bildseiten = (optionen.anhang?.bilder ?? []).map((bild, index) => ({
    id: foundryId(`${szenario.title}/anhang/${bild.file}`),
    name: bild.name ?? bild.file,
    inhalt: bild.pfad,
    sort: FIRST_SORT + index * SORT_STEP,
  }));

  // Die Krankheiten des Hefts bekommen je eine Textseite im Spielhilfen-
  // Journal, hinter den Bildseiten. Warum kein Gegenstand: siehe
  // `world/krankheiten.ts`. Die Kennung haengt am Namen.
  const krankheiten = sammleKrankheiten(szenario.blocks);
  const krankheitsseiten = krankheiten.map((krankheit, index) => ({
    id: foundryId(`${szenario.title}/anhang/krankheit/${krankheit.name}`),
    name: krankheitSeitenName(krankheit),
    inhalt: krankheitSeiteHtml(krankheit),
    art: 'text' as const,
    sort: FIRST_SORT + (bildseiten.length + index) * SORT_STEP,
  }));

  const anhang =
    optionen.anhang && bildseiten.length + krankheitsseiten.length > 0
      ? { journalName: optionen.anhang.titel, seiten: [...bildseiten, ...krankheitsseiten] }
      : undefined;

  // Die Handouts des Hefts — Briefe und Notizen fuer die Spieler — bekommen
  // ein eigenes Journal, damit sich eine Seite davon zeigen laesst, ohne das
  // Spielleiter-Journal zu oeffnen. Die Kennung haengt am Titel: Ein zweites
  // Handout im naechsten Lauf verschiebt das erste nicht.
  const gefundeneHandouts = sammleHandouts(szenario.blocks);
  const handouts =
    gefundeneHandouts.length > 0
      ? {
          journalName: HANDOUT_JOURNAL,
          seiten: gefundeneHandouts.map((handout, index) => ({
            id: foundryId(`${szenario.title}/handout/${handout.titel}`),
            name: handout.titel,
            inhalt: handout.html,
            sort: FIRST_SORT + index * SORT_STEP,
          })),
        }
      : undefined;

  // Personen mit Bild, aber ohne Statblock: aus dem Anhang, und erst hier —
  // ihr Rueckverweis zeigt auf die Bildseite, die es ohne den Anhang nicht
  // gibt. Sie stehen bewusst **nach** den Journalverweisen oben: Ein NSC hat
  // keinen Statblock, auf den ein Verweis im Text zeigen koennte.
  if (optionen.nscActors) {
    const seitenNachDatei = new Map(
      (optionen.anhang?.bilder ?? []).map((bild) => [
        bild.file,
        foundryId(`${szenario.title}/anhang/${bild.file}`),
      ]),
    );
    for (const nsc of sammleNscs(
      optionen.personen ?? [],
      kreaturen.map((kreatur) => kreatur.name),
    )) {
      const seite = seitenNachDatei.get(nsc.file);
      if (!seite) continue;
      const token = tokenAusPortraet('nsc', nsc.bild, optionen.tokenRinge === true);
      kreaturen.push({
        id: foundryId(`${szenario.title}/actor/nsc/${nsc.name}`),
        name: nsc.name,
        daten: baueNsc({ ...nsc, quelle: quellenangabe(designation, szenario.title) }),
        bild: nsc.bild,
        ...(token ? { tokenBild: token.bild, ring: token.ring } : {}),
        journalSeite: seite,
        stufe: 1,
        art: 'nsc',
      });
    }
  }

  // Zwei Karten desselben Schauplatzes heissen gleich (etwa die Fassungen
  // fuer zwei Stufenbereiche) — die Szene zaehlt dann durch, wie die Dateien.
  const schluessel = scenarioKey(designation);
  const szenenNamen = new Map<string, number>();
  const szenen = (optionen.karten ?? []).map((karte) => {
    const name = karte.name ?? karte.file;
    const nth = (szenenNamen.get(name) ?? 0) + 1;
    szenenNamen.set(name, nth);
    const vermessen = kartenEinstellung(schluessel, karte.file);
    const waende = kartenWaende(schluessel, karte.file);
    return {
      id: foundryId(`${szenario.title}/szene/${karte.file}`),
      name: nth > 1 ? `${name} (${nth})` : name,
      hintergrund: karte.pfad,
      breite: karte.breite,
      hoehe: karte.hoehe,
      ...(vermessen
        ? {
            gitter: vermessen.gitter,
            versatzX: vermessen.versatzX,
            versatzY: vermessen.versatzY,
            ...(vermessen.skalierung !== undefined ? { skalierung: vermessen.skalierung } : {}),
          }
        : {}),
      ...(waende ? { waende } : {}),
    };
  });

  const wunsch: Wunsch = {
    season: designation.season,
    schluessel,
    seasonOrdnerName: seasonFolderName(designation.season),
    szenarioOrdnerName: scenarioFolderName(designation, szenario.title),
    journalName: journalName(designation, szenario.title, optionen.schema),
    seiten,
    ...(anhang ? { anhang } : {}),
    ...(handouts ? { handouts } : {}),
    ...(szenen.length > 0 ? { szenen } : {}),
    ...(kreaturen.length > 0 ? { kreaturen } : {}),
    ...(effekte.length > 0 ? { effekte } : {}),
  };

  const plan = planeImport(weltabbild(), wunsch);

  // Der Verweis aus dem Haupttext auf eine Krankheitsseite braucht die
  // Kennung des Spielhilfen-Journals. Ein vorhandenes Journal bringt sie im
  // Plan mit; ein neues bekommt sie hier vergeben, aus dem Titel abgeleitet,
  // und `apply.ts` legt es mit genau dieser Kennung an.
  let krankheitenVerlinkt = 0;
  if (plan.anhang && krankheitsseiten.length > 0) {
    const journal = plan.anhang.journal;
    const journalId =
      journal.art === 'aktualisieren'
        ? journal.id
        : (journal.id ??= foundryId(`${szenario.title}/anhang`));
    krankheitenVerlinkt = fuegeKrankheitVerweiseEin(
      seiten,
      krankheiten.map((krankheit, index) => ({
        satz: krankheit.name,
        uuid: `JournalEntry.${journalId}.JournalEntryPage.${krankheitsseiten[index]!.id}`,
      })),
    );
  }

  return {
    wunsch,
    plan,
    seiten,
    schluessel: wunsch.schluessel,
    season: wunsch.season,
    bilderEingebettet,
    effekteVerlinkt,
    krankheiten: {
      seiten: krankheitsseiten.map((seite) => seite.name),
      verlinkt: krankheitenVerlinkt,
    },
    bilderGesamt: optionen.bilder?.length ?? 0,
    gefahrenReste,
    ...(optionen.sourceHash ? { sourceHash: optionen.sourceHash } : {}),
  };
}

export async function schreibe(
  vorhaben: Vorhaben,
  toolVersion?: string,
): Promise<Importergebnis> {
  return fuehreAus(
    vorhaben.plan,
    vorhaben.seiten,
    {
      season: vorhaben.season,
      schluessel: vorhaben.schluessel,
      ...(vorhaben.sourceHash ? { sourceHash: vorhaben.sourceHash } : {}),
      ...(toolVersion ? { toolVersion } : {}),
      bilder: vorhaben.bilderGesamt,
    },
    vorhaben.wunsch.anhang?.seiten ?? [],
    vorhaben.wunsch.szenen ?? [],
    vorhaben.wunsch.kreaturen ?? [],
    vorhaben.wunsch.effekte ?? [],
    vorhaben.wunsch.handouts?.seiten ?? [],
  );
}

export { lies };
