import { ActorIndex, type ActorEntry, type ActorKind } from '../pdf/actors.ts';
import { ConditionIndex, type ConditionEntry } from '../pdf/conditions.ts';
import { ItemIndex, type ItemEntry, type ItemKind } from '../pdf/items.ts';

/**
 * Die Kompendium-Indizes, zur Laufzeit aus `game.packs` aufgebaut.
 *
 * Im Extractor lagen sie als eingefrorene JSON-Dateien im Repo (1,2 MB),
 * erzeugt aus einem lokalen Klon des pf2e-Systems. Hier ist das nicht noetig
 * und auch nicht wuenschenswert: das installierte System ist zur Hand, sein
 * Index ist immer der richtige, und Eintraege aus zusaetzlich installierten
 * Modulen zaehlen ohne Zutun mit.
 *
 * Damit entfallen die drei `data/*-index.json`, die drei `gen-*-index.ts` und
 * `pf2e-manifest.ts` — letzteres loeste den echten Kompendiumsnamen aus dem
 * Systemmanifest auf, was hier `pack.collection` von selbst tut.
 */

/**
 * Die Kompendien, in denen nach einer **Kreatur** gesucht wird.
 *
 * Nur die systemweiten Grundwerke: sie gelten fuer jedes Szenario. Die
 * Jahrgangsbestiarien bleiben hier draussen — dort steht derselbe Name fuer
 * eine szenariospezifische Fassung.
 */
const CREATURE_PACKS = [
  'pf2e.pathfinder-monster-core',
  'pf2e.pathfinder-monster-core-2',
  'pf2e.pathfinder-npc-core',
];

/** Das systemweite Grundwerk fuer **Gefahren**. */
const HAZARD_CORE = 'pf2e.hazards';

/**
 * Jahrgangsbestiarien, fuer Gefahren **mitgezaehlt**.
 *
 * Bei Kreaturen bleiben sie draussen, weil das Grundwerk die Kreatur schon
 * fuehrt. Bei Gefahren ist es umgekehrt: von den 44 Gefahren der dreizehn
 * geprueften Hefte stehen nur 4 im systemweiten `hazards`. Die
 * Jahrgangsfassung ist dort keine konkurrierende, sondern die einzige.
 *
 * Als Muster statt als Liste, damit ein kuenftiges Bestiarium der Season 8
 * ohne Codeaenderung mitzaehlt.
 */
const PFS_BESTIARY = /^pf2e\.pfs-season-\d+-bestiary$/;

const ITEM_PACKS: { collection: string; kind: ItemKind }[] = [
  { collection: 'pf2e.equipment-srd', kind: 'equipment' },
  { collection: 'pf2e.spells-srd', kind: 'spell' },
];

const CONDITION_PACK = 'pf2e.conditionitems';

/** Welcher Dokumenttyp welche Art traegt. Beides sind Actors. */
const ACTOR_DOCUMENT_TYPE: Record<ActorKind, string> = { creature: 'npc', hazard: 'hazard' };

export interface Indizes {
  actors: ActorIndex;
  items: ItemIndex;
  conditions: ConditionIndex;
  /** Was tatsaechlich gefunden wurde — fuer den Bericht im Dialog. */
  zaehlung: { kreaturen: number; gefahren: number; gegenstaende: number; zauber: number; bedingungen: number };
}

let gemerkt: Indizes | undefined;

/**
 * Baut die Indizes einmal je Sitzung.
 *
 * Ein Neuaufbau kostet ein paar Sekunden — `getIndex` holt bei den grossen
 * Kompendien mehrere tausend Eintraege. Wer das System wechselt oder Module
 * zu- oder abschaltet, laedt Foundry ohnehin neu.
 */
export async function ladeIndizes(neu = false): Promise<Indizes> {
  if (gemerkt && !neu) return gemerkt;

  const [actorEintraege, itemEintraege, conditionEintraege] = await Promise.all([
    sammleActors(),
    sammleItems(),
    sammleConditions(),
  ]);

  gemerkt = {
    actors: new ActorIndex(actorEintraege),
    items: new ItemIndex(itemEintraege),
    conditions: new ConditionIndex(conditionEintraege),
    zaehlung: {
      kreaturen: actorEintraege.filter((e) => e.kind === 'creature').length,
      gefahren: actorEintraege.filter((e) => e.kind === 'hazard').length,
      gegenstaende: itemEintraege.filter((e) => e.kind === 'equipment').length,
      zauber: itemEintraege.filter((e) => e.kind === 'spell').length,
      bedingungen: conditionEintraege.length,
    },
  };

  return gemerkt;
}

/** Vergisst die gemerkten Indizes — fuer die Konsole beim Entwickeln. */
export function vergissIndizes(): void {
  gemerkt = undefined;
}

function packsNach(muster: RegExp): string[] {
  return (game.packs?.contents ?? [])
    .map((pack) => pack.collection)
    .filter((collection) => muster.test(collection));
}

async function holeIndex(collection: string, felder: string[]): Promise<FoundryIndexEintrag[]> {
  const pack = game.packs?.get(collection);
  if (!pack) return [];
  const index = await pack.getIndex({ fields: felder });
  return index.contents;
}

async function sammleActors(): Promise<ActorEntry[]> {
  const gefunden: ActorEntry[] = [];

  // Reihenfolge ist Rangfolge: bei gleichem Namen gewinnt das zuerst genannte
  // Kompendium — Monster Core vor Monster Core 2 vor NPC Core, wie ein
  // Spielleiter auch nachschlaegt. Bei Gefahren das Grundwerk vor den
  // Jahrgaengen.
  const plan: { collections: string[]; kind: ActorKind }[] = [
    { collections: CREATURE_PACKS, kind: 'creature' },
    { collections: [HAZARD_CORE, ...packsNach(PFS_BESTIARY)], kind: 'hazard' },
  ];

  for (const { collections, kind } of plan) {
    for (const collection of collections) {
      // Die Stufe prueft den Treffer gegen die Statblock-Ueberschrift und ist
      // kein Vorgabefeld des Index — sie muss ausdruecklich angefordert werden.
      const eintraege = await holeIndex(collection, ['system.details.level.value']);
      for (const eintrag of eintraege) {
        const level = eintrag.system?.details?.level?.value;
        if (eintrag.type !== ACTOR_DOCUMENT_TYPE[kind]) continue;
        if (typeof eintrag.name !== 'string' || typeof level !== 'number') continue;
        gefunden.push({ name: eintrag.name, pack: collection, id: eintrag._id, level, kind });
      }
    }
  }

  return entdopple(gefunden, (eintrag) => `${eintrag.kind}|${eintrag.name.toLowerCase()}`);
}

async function sammleItems(): Promise<ItemEntry[]> {
  const gefunden: ItemEntry[] = [];

  for (const { collection, kind } of ITEM_PACKS) {
    for (const eintrag of await holeIndex(collection, [])) {
      if (typeof eintrag.name !== 'string') continue;
      gefunden.push({ name: eintrag.name, pack: collection, id: eintrag._id, kind });
    }
  }

  return entdopple(gefunden, (eintrag) => `${eintrag.kind}|${eintrag.name.toLowerCase()}`);
}

async function sammleConditions(): Promise<ConditionEntry[]> {
  const gefunden: ConditionEntry[] = [];

  // `isValued` entscheidet, ob nach dem Namen eine Zahl stehen muss
  // (`sickened 2`) oder nicht (`prone`) — ohne das Feld traefe `sickened`
  // auch dort, wo keine Stufe genannt ist.
  for (const eintrag of await holeIndex(CONDITION_PACK, ['system.value.isValued'])) {
    if (typeof eintrag.name !== 'string') continue;
    gefunden.push({
      name: eintrag.name,
      pack: CONDITION_PACK,
      id: eintrag._id,
      valued: eintrag.system?.value?.isValued === true,
    });
  }

  return gefunden;
}

function entdopple<T>(eintraege: T[], schluessel: (eintrag: T) => string): T[] {
  const nachName = new Map<string, T>();
  for (const eintrag of eintraege) {
    const k = schluessel(eintrag);
    if (!nachName.has(k)) nachName.set(k, eintrag);
  }
  return [...nachName.values()];
}
