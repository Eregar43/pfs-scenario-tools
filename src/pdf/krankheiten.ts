/**
 * Krankheiten des Hefts — der Statblock `… DISEASE 7` im Anhang.
 *
 * Belegstelle: genau eine in der Season 8 (8-06, Seite 11). Gebaut ist der
 * Leser an dieser Form. Gifte (`POISON`) und Flueche (`CURSE`) sind
 * gleich gesetzt, aber ohne Belegstelle nicht aufgenommen — ein Muster ohne
 * Heft laesst sich nicht pruefen (siehe `TODO.md`).
 *
 * Die Form, hier nachgebildet:
 *
 *   RUSTLUNG DISEASE 4                       Kopfzeile in Versalien
 *   DISEASE VIRULENT                         Merkmalsplakette
 *   *Buch* 12 **Saving Throw** DC 18 Fortitude; **Onset** 1 day;
 *   **Stage 1** enfeebled 1 (1 day); **Stage 2** enfeebled 2 and
 *   1d6 poison damage (1 day)
 *
 * Gelesen wird **im Blockstrom**, wie bei den Kreaturen: Kopfzeile, dahinter
 * die Plakette, dahinter der Werteblock. Die Rolle des Werteblocks ist
 * Nebensache — Paizo setzt ihn mal als `box`, mal als `statblock`; was
 * zaehlt, ist der Rettungswurf darin.
 *
 * Kein Foundry-Bezug. Die Gegenstandsdaten baut `world/krankheiten.ts`.
 */
import { titleCase } from './text.ts';
import type { Block } from './types.ts';

export type Zeiteinheit = 'rounds' | 'minutes' | 'hours' | 'days';

export interface Zeitspanne {
  wert: number;
  einheit: Zeiteinheit;
}

export interface Krankheitsstufe {
  nummer: number;
  /** Der Wortlaut der Stufe ohne die Dauer in Klammern. */
  text: string;
  /** Bedingungen des Systems, mit Wert, wo eine Zahl dahintersteht. */
  bedingungen: { slug: string; wert?: number }[];
  /** Schaden je Stufe — bei Krankheiten selten, bei Giften die Regel. */
  schaden: { formel: string; art: string }[];
  dauer?: Zeitspanne;
}

export interface Krankheit {
  /** In Titelschreibung, wie die Kreaturennamen. */
  name: string;
  /** Die Stufe aus der Kopfzeile. */
  stufe: number;
  /** Die Plakette, klein geschrieben: `disease`, `virulent`. */
  merkmale: string[];
  rettungswurf: { art: 'fortitude' | 'reflex' | 'will'; dc: number };
  onset?: Zeitspanne;
  hoechstdauer?: Zeitspanne;
  stufen: Krankheitsstufe[];
  /** Das Buch der Fundstelle, falls der Werteblock eines nennt. */
  quelle?: string;
  /** Der Werteblock im Wortlaut — fuer die Beschreibung. */
  text: string;
  seite: number;
}

const KOPFZEILE = /^(.+?)\s+DISEASE\s+(\d+)$/;
const QUELLE = /^\*([^*]+)\*\s+\d+/;
const RETTUNGSWURF = /\*\*Saving Throw\*\*\s+DC\s+(\d+)\s+(Fortitude|Reflex|Will)\b/i;
const ONSET = /\*\*Onset\*\*\s+(\d+)\s+(round|minute|hour|day)s?\b/i;
const HOECHSTDAUER = /\*\*Maximum Duration\*\*\s+(\d+)\s+(round|minute|hour|day)s?\b/i;
const STUFE = /^\*\*Stage\s+(\d+)\*\*\s*(.*)$/i;
const DAUER_AM_ENDE = /\s*\((\d+)\s+(round|minute|hour|day)s?\)\s*$/i;
const SCHADEN = /(\d+d\d+(?:[+-]\d+)?)\s+(\p{L}+)\s+damage/giu;

/**
 * Die Bedingungen des Systems (`CONDITION_SLUGS` in `item/condition/values.ts`),
 * soweit sie in einem Krankheits- oder Giftstatblock stehen koennen.
 */
const BEDINGUNGEN = [
  'blinded',
  'clumsy',
  'confused',
  'dazzled',
  'deafened',
  'doomed',
  'drained',
  'dying',
  'enfeebled',
  'fascinated',
  'fatigued',
  'fleeing',
  'frightened',
  'immobilized',
  'off-guard',
  'paralyzed',
  'petrified',
  'prone',
  'sickened',
  'slowed',
  'stunned',
  'stupefied',
  'unconscious',
  'wounded',
];
const BEDINGUNG = new RegExp(`\\b(${BEDINGUNGEN.join('|')})\\b(?:\\s+(\\d+))?`, 'gi');

function zeitspanne(wert: string, einheit: string): Zeitspanne {
  return { wert: Number(wert), einheit: `${einheit.toLowerCase()}s` as Zeiteinheit };
}

function leseStufe(segment: string): Krankheitsstufe | undefined {
  const stufe = STUFE.exec(segment);
  if (!stufe) return undefined;
  let text = stufe[2]!.trim();
  let dauer: Zeitspanne | undefined;
  const amEnde = DAUER_AM_ENDE.exec(text);
  if (amEnde) {
    dauer = zeitspanne(amEnde[1]!, amEnde[2]!);
    text = text.slice(0, amEnde.index).trim();
  }
  const bedingungen = [...text.matchAll(BEDINGUNG)].map((treffer) => ({
    slug: treffer[1]!.toLowerCase(),
    ...(treffer[2] !== undefined ? { wert: Number(treffer[2]) } : {}),
  }));
  const schaden = [...text.matchAll(SCHADEN)].map((treffer) => ({
    formel: treffer[1]!,
    art: treffer[2]!.toLowerCase(),
  }));
  return {
    nummer: Number(stufe[1]),
    text,
    bedingungen,
    schaden,
    ...(dauer ? { dauer } : {}),
  };
}

/** Liest den Werteblock; `undefined`, wenn er keinen Rettungswurf nennt. */
export function leseKrankheit(
  kopfzeile: string,
  plakette: string,
  werte: string,
  seite: number,
): Krankheit | undefined {
  const kopf = KOPFZEILE.exec(kopfzeile.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim());
  if (!kopf) return undefined;
  const text = werte.replace(/\s+/g, ' ').trim();
  const rettungswurf = RETTUNGSWURF.exec(text);
  if (!rettungswurf) return undefined;

  const onset = ONSET.exec(text);
  const hoechstdauer = HOECHSTDAUER.exec(text);
  const quelle = QUELLE.exec(text);
  const stufen = text
    .split(/;\s*/)
    .map((segment) => leseStufe(segment.trim()))
    .filter((stufe): stufe is Krankheitsstufe => stufe !== undefined);

  return {
    name: titleCase(kopf[1]!),
    stufe: Number(kopf[2]),
    merkmale: plakette.toLowerCase().split(/\s+/).filter((wort) => wort !== ''),
    rettungswurf: {
      art: rettungswurf[2]!.toLowerCase() as Krankheit['rettungswurf']['art'],
      dc: Number(rettungswurf[1]),
    },
    ...(onset ? { onset: zeitspanne(onset[1]!, onset[2]!) } : {}),
    ...(hoechstdauer ? { hoechstdauer: zeitspanne(hoechstdauer[1]!, hoechstdauer[2]!) } : {}),
    stufen,
    ...(quelle ? { quelle: quelle[1]!.trim() } : {}),
    text,
    seite,
  };
}

/**
 * Sammelt die Krankheiten des Hefts, jede genau einmal — dieselbe Kopfzeile
 * kann in der Begegnungsliste **und** im Anhang stehen; nur die Stelle mit
 * Rettungswurf zaehlt.
 */
export function sammleKrankheiten(blocks: Block[]): Krankheit[] {
  const gefunden: Krankheit[] = [];
  for (let i = 0; i + 2 < blocks.length; i++) {
    const plakette = blocks[i + 1]!;
    if (plakette.role !== 'traits') continue;
    const krankheit = leseKrankheit(blocks[i]!.text, plakette.text, blocks[i + 2]!.text, blocks[i]!.page);
    if (!krankheit || gefunden.some((bekannt) => bekannt.name === krankheit.name)) continue;
    gefunden.push(krankheit);
  }
  return gefunden;
}
