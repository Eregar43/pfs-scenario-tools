/**
 * Wendet die Abweichungen des Hefts auf die Kompendium-Kopie an.
 *
 * Der Abgleich (`statblock-abgleich.ts`) findet sie; hier werden sie
 * geschrieben. Beides muss beieinander bleiben: **Was gemeldet wird, muss
 * auch angewendet werden** — sonst behauptet die Vorschau etwas anderes, als
 * hinterher in der Welt steht. Das Repo hat diese Lektion schon einmal
 * andersherum gelernt (die Waende wurden geschrieben, aber nicht verglichen).
 *
 * Gepatcht wird das **reine Datenobjekt** vor `Actor.create`, nicht der fertige
 * Actor danach. Damit gibt es nur einen Schreibvorgang, keine nachtraeglichen
 * Aenderungen an eingebetteten Dokumenten — und `apply.ts` bleibt, wie es ist:
 * Es kennt bereits Kreaturen mit fertigen `daten`.
 *
 * Bei Elite und Schwach bleiben alle Zahlen unberuehrt. Die rechnet das
 * PF2e-System selbst nach (`applyAdjustment`), und zwar **nach** dem Anlegen —
 * wer sie hier setzt, bekommt sie doppelt angepasst.
 */
import { foundryId } from '../pdf/journal.ts';
import type { Angriff, Statblock } from '../pdf/statblock.ts';
import { normalisiere, type Vorlagenabbild } from './statblock-abgleich.ts';

type Rohdaten = Record<string, unknown>;

/** Die Schluessel, die das System kennt — aus `CONFIG.PF2E`. */
export interface Angleichwerke {
  /** `CONFIG.PF2E.creatureTraits` */
  merkmale?: ReadonlySet<string>;
  /** `CONFIG.PF2E.senses` */
  sinne?: ReadonlySet<string>;
  /** `CONFIG.PF2E.languages` */
  sprachen?: ReadonlySet<string>;
  /** `CONFIG.PF2E.npcAttackTraits` */
  angriffsMerkmale?: ReadonlySet<string>;
}

export interface Angleich {
  /** Die angeglichenen Actordaten. */
  daten: Rohdaten;
  /**
   * Was nicht angewendet werden konnte — Schluessel, die das System nicht
   * kennt. Gehoert in die Vorschau; verschwiegen waere es eine stille Luecke
   * zwischen dem, was gemeldet, und dem, was geschrieben wurde.
   */
  ungenutzt: string[];
}

/**
 * Die Groesse in der Schreibung des Systems.
 *
 * Gegenstueck zur Tabelle im Abgleich, die in die andere Richtung uebersetzt:
 * Die Plakette druckt `MEDIUM`, das Dokument fuehrt `med`.
 */
const GROESSE_SCHLUESSEL: Record<string, string> = {
  tiny: 'tiny',
  small: 'sm',
  medium: 'med',
  large: 'lg',
  huge: 'huge',
  gargantuan: 'grg',
};

const SELTENHEITEN = new Set(['common', 'uncommon', 'rare', 'unique']);

function objekt(wert: unknown): Rohdaten {
  return wert && typeof wert === 'object' ? (wert as Rohdaten) : {};
}

/** Legt einen Wert auf einem verschachtelten Pfad ab, ohne Nachbarn zu stoeren. */
function setze(wurzel: Rohdaten, pfad: readonly string[], wert: unknown): void {
  let stelle = wurzel;
  for (const teil of pfad.slice(0, -1)) {
    if (!stelle[teil] || typeof stelle[teil] !== 'object') stelle[teil] = {};
    stelle = stelle[teil] as Rohdaten;
  }
  stelle[pfad[pfad.length - 1]!] = wert;
}

/**
 * `fist` und `Fist` sind derselbe Angriff; `clan dagger` und `Clan Dagger`
 * auch. Gepaart wird ueber diesen Schluessel, wie im Abgleich.
 */
function angriffsSchluessel(art: string, name: string): string {
  return `${art}|${normalisiere(name)}`;
}

/**
 * Baut aus einer gedruckten Angriffszeile ein `melee`-Item.
 *
 * Dasselbe Schema wie beim Bau einer Gefahr: Die Reichweite gehoert in
 * `system.range`, nicht unter die Merkmale.
 */
function neuesAngriffsItem(
  angriff: Angriff,
  samen: string,
  erlaubt: ReadonlySet<string> | undefined,
  ungenutzt: string[],
): Rohdaten {
  const { merkmale, reichweite } = zerlegeAngriffsmerkmale(angriff, erlaubt, ungenutzt);
  const wurfId = foundryId(`${samen}/schaden/${angriff.name}`);

  return {
    _id: foundryId(`${samen}/angriff/${angriff.art}/${angriff.name}`),
    name: angriff.name,
    type: 'melee',
    system: {
      bonus: { value: angriff.mod },
      damageRolls: angriff.formel
        ? { [wurfId]: { damage: angriff.formel, damageType: angriff.schadensart ?? 'untyped' } }
        : {},
      traits: { value: merkmale },
      range: reichweite === undefined ? null : { increment: reichweite, max: null },
      attackEffects: { value: [] },
      description: { value: '' },
    },
  };
}

/** Trennt die Reichweite von den Merkmalen und prueft den Rest. */
function zerlegeAngriffsmerkmale(
  angriff: Angriff,
  erlaubt: ReadonlySet<string> | undefined,
  ungenutzt: string[],
): { merkmale: string[]; reichweite?: number } {
  let reichweite: number | undefined;
  const merkmale: string[] = [];

  for (const roh of angriff.merkmale) {
    const treffer = /^range\s+increment\s+(\d+)/i.exec(roh.trim());
    if (treffer) {
      reichweite = Number(treffer[1]);
      continue;
    }
    const schluessel = normalisiere(roh);
    if (erlaubt && !erlaubt.has(schluessel)) {
      ungenutzt.push(`Angriffsmerkmal ${angriff.name}: ${schluessel}`);
      continue;
    }
    merkmale.push(schluessel);
  }

  return { merkmale, ...(reichweite === undefined ? {} : { reichweite }) };
}

/**
 * Gleicht die Angriffe an: gepaarte werden nachgezogen, fehlende angelegt,
 * ueberzaehlige entfernt.
 *
 * Gepaart wird ueber den **Namen**, nicht ueber die Reihenfolge — und was
 * gepaart ist, behaelt sein Item. So bleiben Zusaetze des Kompendiums stehen,
 * die im Heft gar nicht stehen koennen (verknuepfte Gifte etwa). Nur was das
 * Heft anders nennt, wird ersetzt: aus der Faust des Piraten wird die Klaue
 * des Captain Ashfell.
 */
function gleicheAngriffeAn(
  daten: Rohdaten,
  heft: Statblock,
  samen: string,
  zahlenSetzen: boolean,
  werke: Angleichwerke,
  ungenutzt: string[],
): void {
  const items = Array.isArray(daten['items']) ? (daten['items'] as Rohdaten[]) : [];
  const fremde = items.filter((item) => item['type'] !== 'melee');
  const angriffe = items.filter((item) => item['type'] === 'melee');

  const offen = [...angriffe];
  const behalten: Rohdaten[] = [];

  for (const gedruckt of heft.angriffe) {
    const schluessel = angriffsSchluessel(gedruckt.art, gedruckt.name);
    const i = offen.findIndex((item) => {
      const system = objekt(item['system']);
      const art = objekt(system['range'])['increment'] !== undefined ? 'ranged' : 'melee';
      return angriffsSchluessel(art, String(item['name'] ?? '')) === schluessel;
    });

    if (i === -1) {
      // Bei Elite und Schwach traegt die gedruckte Zeile bereits angepasste
      // Werte. Ein daraus gebautes Item wuerde von `applyAdjustment` ein
      // zweites Mal angepasst — lieber melden als doppelt rechnen.
      if (!zahlenSetzen) {
        ungenutzt.push(`Angriff ${gedruckt.name}`);
        continue;
      }
      behalten.push(neuesAngriffsItem(gedruckt, samen, werke.angriffsMerkmale, ungenutzt));
      continue;
    }

    const item = offen.splice(i, 1)[0]!;
    const system = objekt(item['system']);
    const verworfen: string[] = [];
    const { merkmale, reichweite } = zerlegeAngriffsmerkmale(
      gedruckt,
      werke.angriffsMerkmale,
      verworfen,
    );
    ungenutzt.push(...verworfen);

    // Nur ersetzen, wenn die gedruckte Zeile **vollstaendig** lesbar war.
    // Sonst verschlechterte ein Satzfehler des Hefts, was die Vorlage richtig
    // hat: Bei den Animated Brooms (8-01) fehlt ein Komma, `finesse magical`
    // wird ein unbekanntes Merkmal — und die Kopie verloere `finesse` und
    // `magical`, die sie vorher korrekt trug.
    if (verworfen.length === 0) {
      system['traits'] = { ...objekt(system['traits']), value: merkmale };
      system['range'] = reichweite === undefined ? null : { increment: reichweite, max: null };
    }

    // Bonus und Schadenswuerfel zieht bei Elite und Schwach das System nach.
    if (zahlenSetzen) {
      system['bonus'] = { ...objekt(system['bonus']), value: gedruckt.mod };
      const wuerfe = objekt(system['damageRolls']);
      const ersterSchluessel = Object.keys(wuerfe)[0];
      if (gedruckt.formel && ersterSchluessel) {
        wuerfe[ersterSchluessel] = {
          ...objekt(wuerfe[ersterSchluessel]),
          damage: gedruckt.formel,
          damageType: gedruckt.schadensart ?? 'untyped',
        };
      }
    }

    item['system'] = system;
    behalten.push(item);
  }

  // Was das Heft nicht nennt, hat die Kreatur nicht — ein uebrig gebliebener
  // Angriff waere einer, den der Spielleiter am Tisch nie sehen sollte.
  //
  // Ausser bei Elite und Schwach: Dort wird nichts angelegt (siehe oben), also
  // darf auch nichts wegfallen. Sonst verschwaende ein Satzfehler des Hefts
  // einen Angriff ersatzlos — beim Weak Bodyguard (8-04) steht die Schleuder
  // unter `Melee`, obwohl sie eine Reichweite hat.
  daten['items'] = zahlenSetzen ? [...fremde, ...behalten] : [...fremde, ...behalten, ...offen];
}

/**
 * Gleicht die Kopie an den abgedruckten Statblock an.
 *
 * `daten` wird **nicht** veraendert; zurueck kommt eine angeglichene Fassung.
 */
export function gleicheAn(
  daten: Rohdaten,
  heft: Statblock,
  vorlage: Vorlagenabbild,
  optionen: { anpassung?: 'elite' | 'weak'; werke?: Angleichwerke } = {},
): Angleich {
  const werke = optionen.werke ?? {};
  const ungenutzt: string[] = [];
  const kopie = structuredClone(daten);
  const zahlenSetzen = optionen.anpassung === undefined;

  const geprueft = (
    werte: readonly string[],
    erlaubt: ReadonlySet<string> | undefined,
    was: string,
  ): string[] =>
    werte.map(normalisiere).filter((wert) => {
      if (!erlaubt || erlaubt.has(wert)) return true;
      ungenutzt.push(`${was}: ${wert}`);
      return false;
    });

  // Merkmalsplakette: Groesse und Seltenheit haben eigene Felder, der Rest
  // sind Merkmale.
  const plakette = heft.merkmale.map(normalisiere);
  const groesse = plakette.find((wort) => wort in GROESSE_SCHLUESSEL);
  const seltenheit = plakette.find((wort) => SELTENHEITEN.has(wort));
  const merkmale = geprueft(
    plakette.filter((wort) => !(wort in GROESSE_SCHLUESSEL) && !SELTENHEITEN.has(wort)),
    werke.merkmale,
    'Merkmal',
  );

  setze(kopie, ['system', 'traits', 'value'], merkmale);
  if (groesse) setze(kopie, ['system', 'traits', 'size', 'value'], GROESSE_SCHLUESSEL[groesse]);
  setze(kopie, ['system', 'traits', 'rarity'], seltenheit ?? 'common');

  const sinne = geprueft(heft.sinne, werke.sinne, 'Sinn');
  setze(
    kopie,
    ['system', 'perception', 'senses'],
    sinne.map((typ) => ({ type: typ })),
  );

  const sprachen = geprueft(heft.sprachen, werke.sprachen, 'Sprache');
  setze(kopie, ['system', 'details', 'languages', 'value'], sprachen);

  // Das Tempo faellt nicht unter Elite und Schwach — beim Dwarf Rigger ist es
  // gerade der Unterschied (25 statt 30).
  if (heft.tempo?.wert !== undefined) {
    setze(kopie, ['system', 'attributes', 'speed', 'value'], heft.tempo.wert);
  }

  if (zahlenSetzen) {
    if (heft.perception !== undefined) setze(kopie, ['system', 'perception', 'mod'], heft.perception);
    if (heft.ac !== undefined) setze(kopie, ['system', 'attributes', 'ac', 'value'], heft.ac);
    if (heft.tp !== undefined) {
      setze(kopie, ['system', 'attributes', 'hp', 'max'], heft.tp);
      setze(kopie, ['system', 'attributes', 'hp', 'value'], heft.tp);
    }
    for (const [kurz, lang] of [
      ['fort', 'fortitude'],
      ['ref', 'reflex'],
      ['will', 'will'],
    ] as const) {
      const wert = heft.rettungswuerfe[kurz];
      if (wert !== undefined) setze(kopie, ['system', 'saves', lang, 'value'], wert);
    }
    for (const attribut of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      const wert = heft.attribute[attribut];
      if (wert !== undefined) setze(kopie, ['system', 'abilities', attribut, 'mod'], wert);
    }

    // Fertigkeiten nur dort nachziehen, wo die Vorlage sie ohnehin fuehrt.
    // Eine Lore-Fertigkeit steht als eigenes Item und wird hier nicht
    // angefasst — sie zu bauen waere ein eigener Schritt.
    const vorlagenwert = new Map(
      vorlage.fertigkeiten.map((f) => [normalisiere(f.name), f.mod] as const),
    );
    for (const fertigkeit of heft.fertigkeiten) {
      const schluessel = normalisiere(fertigkeit.name);
      // Stimmt die Vorlage ohnehin ueberein, gibt es nichts anzugleichen und
      // nichts zu melden — sonst stuende jede Lore-Fertigkeit in der Vorschau,
      // obwohl an ihr nichts fehlt.
      if (vorlagenwert.get(schluessel) === fertigkeit.mod) continue;

      if (objekt(objekt(objekt(kopie['system'])['skills'])[schluessel])['base'] !== undefined) {
        setze(kopie, ['system', 'skills', schluessel, 'base'], fertigkeit.mod);
        continue;
      }

      // Wissensfertigkeiten stehen nicht in `system.skills`, sondern als
      // eigenes Item vom Typ `lore` mit `system.mod.value`. Hat die Vorlage
      // es, wird die Zahl dort gesetzt.
      const lore = (Array.isArray(kopie['items']) ? (kopie['items'] as Rohdaten[]) : []).find(
        (item) =>
          item['type'] === 'lore' && normalisiere(String(item['name'] ?? '')) === schluessel,
      );
      if (lore) {
        lore['system'] = {
          ...objekt(lore['system']),
          mod: { ...objekt(objekt(lore['system'])['mod']), value: fertigkeit.mod },
        };
        continue;
      }

      // Hat sie es nicht, muesste ein Item gebaut werden — samt einer
      // Ausbildungsstufe, die im Heft gar nicht steht. Lieber melden als
      // raten.
      ungenutzt.push(`Fertigkeit: ${fertigkeit.name}`);
    }
  }

  gleicheAngriffeAn(kopie, heft, `${heft.name}/${heft.stufe}`, zahlenSetzen, werke, ungenutzt);

  return { daten: kopie, ungenutzt };
}

/**
 * Holt die Schluesselwerke fuer den Angleich aus dem laufenden System.
 *
 * Der einzige Teil dieser Datei, der Foundry braucht — wie bei den Gefahren
 * gilt: lieber zur Laufzeit fragen als eine Kopie mitschleppen, die ab dem
 * naechsten Systemupdate falsch ist.
 */
export function angleichwerkeAusSystem(): Angleichwerke {
  const pf2e = CONFIG?.PF2E;
  const schluessel = (werk: Record<string, string> | undefined): ReadonlySet<string> | undefined =>
    werk ? new Set(Object.keys(werk)) : undefined;

  const merkmale = schluessel(pf2e?.creatureTraits);
  const sinne = schluessel(pf2e?.senses);
  const sprachen = schluessel(pf2e?.languages);
  const angriffsMerkmale = schluessel(pf2e?.npcAttackTraits);

  return {
    ...(merkmale ? { merkmale } : {}),
    ...(sinne ? { sinne } : {}),
    ...(sprachen ? { sprachen } : {}),
    ...(angriffsMerkmale ? { angriffsMerkmale } : {}),
  };
}
