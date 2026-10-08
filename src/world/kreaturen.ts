/**
 * Baut aus einem abgedruckten Statblock die Actordaten einer PF2e-Kreatur.
 *
 * Bis 8-06 nannte jede Kreatur der Season 8 eine Kompendium-Vorlage; gebaut
 * werden mussten nur Gefahren (`gefahren.ts`). 8-07 bringt die ersten
 * Kreaturen, die es nur im Heft gibt: einen Wight-Champion und eine
 * Zombie-Truppe, beide ohne Quellenzeile. Ohne diesen Bau entstand fuer sie
 * kein Actor — und weil ihr Portraet im Anhang steht, legte `nscs.ts` sie
 * stattdessen als NSC mit Stufe 1 und 10 Trefferpunkten an.
 *
 * Diese Datei **schreibt nichts**. Sie liefert reine Daten und ist ohne
 * Foundry testbar, wie der Bau der Gefahren.
 *
 * Das Schema ist abgelesen, nicht erinnert: `_reference/pf2e/packs/pf2e/
 * pathfinder-monster-core/wight.json` und `wraith.json` (Sinne mit
 * Reichweite), `battlecry-bestiary/angelic-chorus.json` (Truppe, Tempo mit
 * `details`, Wissens-Item) und `src/module/actor/npc/data.ts`
 * (`NPCSkillSource`: `base` und `note`).
 */
import type { Statblock } from '../pdf/statblock.ts';
import type { OhneVorlage } from '../pdf/journal.ts';
import {
  SELTENHEITEN,
  angriffsItem,
  faehigkeitsItem,
  html,
  leseIwr,
  type Schluesselwerke,
} from './gefahren.ts';
import { normalisiere } from './statblock-abgleich.ts';

export interface GebauteKreatur {
  /** Die Actordaten, wie `Actor.create` sie erwartet. */
  daten: Record<string, unknown>;
  /** Was der Statblock hergab, aber nicht untergebracht werden konnte. */
  ungenutzt: string[];
}

/**
 * Wird dieser Eintrag ohne Vorlage gebaut?
 *
 * Nur eine Kreatur **ohne Quellenzeile**: Sie steht allein im Heft. Nennt
 * der Statblock ein Buch, gibt es eine Vorlage, und sie fehlt nur in dieser
 * Welt — bei einem Starfinder-Buch etwa, weil das Modul „Starfinder
 * Anachronism" nicht aktiv ist. Dann ist die Kopie der richtige Weg, und die
 * Vorschau nennt den Grund, statt einen Nachbau unterzuschieben.
 *
 * Steht an einer Stelle, weil Plan und Vorschau dieselbe Antwort brauchen.
 */
export function wirdAlsKreaturGebaut(eintrag: OhneVorlage): boolean {
  return eintrag.art !== 'hazard' && eintrag.statblock !== undefined && eintrag.buch === undefined;
}

/** Die Plakette druckt `MEDIUM`, das Dokument fuehrt `med`. */
const GROESSE: Record<string, string> = {
  tiny: 'tiny',
  small: 'sm',
  medium: 'med',
  large: 'lg',
  huge: 'huge',
  gargantuan: 'grg',
};

/**
 * `darkvision`, `lifesense 60 feet`, `tremorsense (imprecise) 30 feet`.
 *
 * Die Reichweite steht im System in einem eigenen Feld, ebenso die
 * Genauigkeit — so fuehrt es der Wraith im Monster Core.
 */
export function leseSinn(
  text: string,
): { type: string; range?: number; acuity?: string } | undefined {
  const treffer = /^(.*?)\s*(?:\((precise|imprecise|vague)\))?\s*(\d+)?\s*(?:feet)?\s*$/i.exec(
    text.trim(),
  );
  if (!treffer || treffer[1]!.trim() === '') return undefined;
  return {
    type: normalisiere(treffer[1]!),
    ...(treffer[2] ? { acuity: treffer[2].toLowerCase() } : {}),
    ...(treffer[3] ? { range: Number(treffer[3]) } : {}),
  };
}

/**
 * Die weiteren Bewegungsarten: `fly 20 feet` wird eine eigene Geschwindigkeit,
 * alles andere (`troop movement`) bleibt als Zusatz lesbar stehen.
 */
function leseBewegung(weitere: readonly string[]): {
  otherSpeeds: Array<{ type: string; value: number }>;
  details: string;
} {
  const otherSpeeds: Array<{ type: string; value: number }> = [];
  const rest: string[] = [];
  for (const stueck of weitere) {
    const treffer = /^([a-z]+)\s+(\d+)\s*feet$/i.exec(stueck.trim());
    if (treffer) otherSpeeds.push({ type: treffer[1]!.toLowerCase(), value: Number(treffer[2]) });
    else rest.push(stueck.trim());
  }
  return { otherSpeeds, details: rest.join(', ') };
}

/** `(4 segments, void healing)` → ohne die aeusseren Klammern. */
function ohneKlammern(text: string | undefined): string {
  return (text ?? '').trim().replace(/^\((.*)\)$/, '$1').trim();
}

/**
 * Baut die Actordaten einer Kreatur.
 *
 * Gebaut wird nur, was das Heft hergibt; der Rest steht in `ungenutzt` und
 * damit in der Vorschau. Elite und Schwach gibt es hier nicht — eine
 * Kreatur ohne Vorlage hat keine Grundform, an der das System rechnen
 * koennte; das Heft druckt die fertigen Zahlen.
 */
export function baueKreatur(
  statblock: Statblock,
  werke: Schluesselwerke = {},
  quelle?: string,
): GebauteKreatur {
  const ungenutzt: string[] = [];

  /** Prueft Schluessel gegen eine Liste des Systems und meldet, was fehlt. */
  const geprueft = (
    werte: readonly string[],
    erlaubt: ReadonlySet<string> | undefined,
    was: string,
  ): string[] =>
    werte.filter((wert) => {
      if (!erlaubt || erlaubt.has(wert)) return true;
      ungenutzt.push(`${was}: ${wert}`);
      return false;
    });

  const plakette = statblock.merkmale.map(normalisiere);
  const groesse = plakette.find((wort) => wort in GROESSE);
  const seltenheit = plakette.find((wort) => SELTENHEITEN.has(wort)) ?? 'common';
  const merkmale = geprueft(
    plakette.filter((wort) => !(wort in GROESSE) && !SELTENHEITEN.has(wort)),
    werke.kreaturMerkmale,
    'Merkmal',
  );

  const sinne: Array<{ type: string; range?: number; acuity?: string }> = [];
  for (const text of statblock.sinne) {
    const sinn = leseSinn(text);
    if (!sinn || (werke.sinne && !werke.sinne.has(sinn.type))) {
      ungenutzt.push(`Sinn: ${text}`);
      continue;
    }
    sinne.push(sinn);
  }

  const sprachen = geprueft(statblock.sprachen.map(normalisiere), werke.sprachen, 'Sprache');

  // Fertigkeiten stehen in `system.skills`, Wissen dagegen als eigenes Item
  // vom Typ `lore` — so fuehrt es jede Kreatur des Kompendiums.
  const fertigkeiten: Record<string, { base: number; note?: string }> = {};
  const wissen: Record<string, unknown>[] = [];
  for (const fertigkeit of statblock.fertigkeiten) {
    if (/\blore$/i.test(fertigkeit.name)) {
      wissen.push({
        name: fertigkeit.name,
        type: 'lore',
        system: {
          mod: { value: fertigkeit.mod },
          proficient: { value: 0 },
          description: { value: '' },
        },
      });
      continue;
    }
    const schluessel = normalisiere(fertigkeit.name);
    if (werke.fertigkeiten && !werke.fertigkeiten.has(schluessel)) {
      ungenutzt.push(`Fertigkeit: ${fertigkeit.name}`);
      continue;
    }
    fertigkeiten[schluessel] = {
      base: fertigkeit.mod,
      ...(fertigkeit.zusatz ? { note: fertigkeit.zusatz } : {}),
    };
  }

  const immunitaeten = geprueft(
    statblock.immunitaeten.map((e) => leseIwr(e).typ),
    werke.immunitaeten,
    'Immunitaet',
  ).map((typ) => ({ type: typ, exceptions: [] }));

  const alsIwr = (
    eintraege: readonly string[],
    erlaubt: ReadonlySet<string> | undefined,
    was: string,
  ): Array<{ type: string; value: number; exceptions: string[] }> => {
    const ergebnis: Array<{ type: string; value: number; exceptions: string[] }> = [];
    for (const eintrag of eintraege) {
      const { typ, wert } = leseIwr(eintrag);
      // Ohne Zahl kann das System den Eintrag nicht speichern; mit Ausnahmen
      // in Klammern (`all damage 5 (except force …)`) ginge ein Teil
      // verloren. Beides wird gemeldet statt halb geschrieben.
      if (wert === undefined || wert < 1 || (erlaubt && !erlaubt.has(typ))) {
        ungenutzt.push(`${was}: ${eintrag}`);
        continue;
      }
      ergebnis.push({ type: typ, value: wert, exceptions: [] });
    }
    return ergebnis;
  };

  const bewegung = leseBewegung(statblock.tempo?.weitere ?? []);
  if (statblock.tempo?.wert === undefined && bewegung.otherSpeeds.length === 0) {
    ungenutzt.push('Tempo');
  }

  // Gegenstaende sind im Kompendium eigene Items mit Werten, die das Heft
  // nicht druckt. Die Angriffe tragen ihre Zahlen ohnehin selbst.
  if (statblock.gegenstaende.length > 0) {
    ungenutzt.push(`Gegenstaende: ${statblock.gegenstaende.join(', ')}`);
  }
  for (const abschnitt of statblock.rest) ungenutzt.push(`Etikett: ${abschnitt.etikett}`);

  // Zauber bleiben als lesbarer Text stehen; ein Zaubereintrag mit
  // verknuepften Zaubern ist ein eigener Schritt.
  for (const faehigkeit of statblock.faehigkeiten) {
    if (/\bspells$/i.test(faehigkeit.name)) ungenutzt.push(`Zauber nur als Text: ${faehigkeit.name}`);
  }

  const samen = `${statblock.name}/${statblock.stufe}`;
  const rettung = (wert: number | undefined): { value: number; saveDetail: string } => {
    if (wert === undefined) ungenutzt.push('Rettungswurf');
    return { value: wert ?? 0, saveDetail: '' };
  };
  const attribute = Object.fromEntries(
    (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => [
      a,
      { mod: statblock.attribute[a] ?? 0 },
    ]),
  );

  const daten: Record<string, unknown> = {
    name: statblock.name,
    type: 'npc',
    system: {
      abilities: attribute,
      attributes: {
        ac: { value: statblock.ac ?? 0, details: statblock.acZusatz ?? '' },
        allSaves: { value: '' },
        hp: {
          max: statblock.tp ?? 0,
          value: statblock.tp ?? 0,
          temp: 0,
          details: ohneKlammern(statblock.tpZusatz),
        },
        immunities: immunitaeten,
        weaknesses: alsIwr(statblock.schwaechen, werke.schwaechen, 'Schwaeche'),
        resistances: alsIwr(statblock.resistenzen, werke.resistenzen, 'Resistenz').map((r) => ({
          ...r,
          doubleVs: [],
        })),
        speed: {
          value: statblock.tempo?.wert ?? 0,
          otherSpeeds: bewegung.otherSpeeds,
          ...(bewegung.details ? { details: bewegung.details } : {}),
        },
      },
      details: {
        blurb: '',
        languages: { value: sprachen, details: '' },
        level: { value: statblock.stufe },
        privateNotes: '',
        publicNotes: '',
        // Wie bei NSCs und gebauten Gefahren: das Heft als Quelle.
        publication: { title: quelle ?? '', authors: '', license: 'ORC', remaster: true },
      },
      initiative: { statistic: 'perception' },
      perception: { mod: statblock.perception ?? 0, details: '', senses: sinne },
      saves: {
        fortitude: rettung(statblock.rettungswuerfe.fort),
        reflex: rettung(statblock.rettungswuerfe.ref),
        will: rettung(statblock.rettungswuerfe.will),
      },
      skills: fertigkeiten,
      traits: { rarity: seltenheit, size: { value: GROESSE[groesse ?? 'medium'] }, value: merkmale },
    },
    items: [
      ...wissen,
      ...statblock.angriffe.map((angriff) => angriffsItem(angriff, samen, werke, ungenutzt)),
      ...statblock.faehigkeiten.map((f) => faehigkeitsItem(f, werke, ungenutzt)),
    ],
  };

  return { daten, ungenutzt };
}

