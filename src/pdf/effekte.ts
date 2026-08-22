/**
 * Findet die Boni und Mali, die ein Szenario der Gruppe zuspricht.
 *
 * Gemeint sind Saetze wie „all PCs gain a +1 circumstance bonus on initiative
 * rolls in the combat against the captain on page 8" — Wirkungen, die das
 * Heft **ausserhalb** eines Statblocks verteilt und die am Spieltisch leicht
 * untergehen.
 *
 * An der Season 8 gemessen sind es fuenf Stellen: keine in 8-01, je eine in
 * 8-02 und 8-03, drei in 8-04. Vier davon haengen an einer Wissensprobe im
 * Zweig „kritischer Erfolg", die fuenfte an verstrichener Zeit.
 *
 * Reine Logik, kein Foundry-Bezug. Wie daraus ein Effekt wird, entscheidet
 * `world/effekte.ts`.
 */
import type { Block } from './types.ts';

export type Bonusart = 'circumstance' | 'status' | 'item' | 'untyped';

export interface Szenarioeffekt {
  /**
   * Der Satz aus dem Heft, wortwoertlich.
   *
   * Er ist zweierlei: die Beschreibung des Effekts und der **Anker**, an dem
   * der Verweis im Journal eingesetzt wird.
   */
  satz: string;
  /** Vorzeichenbehaftet: `+1`, `+2`, `-1`. */
  wert: number;
  art: Bonusart;
  /**
   * Die Domaenen des PF2e-Systems, auf die der Wert wirkt.
   *
   * **Leer heisst „nicht zuzuordnen".** Dann entsteht der Effekt ohne
   * Regelbaustein, nur mit Text. Ein Bonus am falschen Wert faellt erst am
   * Spieltisch auf; ein fehlender steht wenigstens lesbar da.
   */
  domaenen: string[];
  /** Wen es betrifft — die Gruppe oder ihre Gegner. */
  ziel: 'gruppe' | 'gegner';
  /** Worauf es wirkt, im Wortlaut des Hefts. Traegt den Namen des Effekts. */
  worauf: string;
  /**
   * Die Heftseite, auf die der Satz verweist („in the chase on **page 7**").
   *
   * Nur damit laesst sich der Bonus auf eine Begegnung eingrenzen: Die Proben
   * dieser Seite bekommen eine Wurf-Option, der Effekt fragt sie ab. Fehlt die
   * Angabe, wirkt der Effekt auf jede Probe seiner Domaene, solange er auf dem
   * Charakter liegt.
   */
  seite?: number;
}

/**
 * Ein Bonus oder Malus mit Zahl und Art.
 *
 * Die Hefte setzen den Halbgeviertstrich `–`, nicht den Bindestrich. Beide
 * sind erlaubt, sonst geht der einzige Malus der Season 8 verloren.
 */
const BONUS =
  /([+−–-])\s*(\d+)\s*(circumstance|status|item|untyped)?\s*(bonus|penalty)\s+(?:to|on)\s+([^.]{2,120})/i;

/** `in the chase on page 7` — die Begegnung, auf die sich der Bonus bezieht. */
const SEITENVERWEIS = /\bon page (\d{1,3})\b/i;

/** Wen der Satz betrifft. Ohne einen dieser Traeger ist es kein Gruppeneffekt. */
const BETEILIGTE = /\b(PCs?|party|players?|enemies|creatures)\b/i;

/**
 * Woran das Heft haengt und was das System daraus macht.
 *
 * Die Reihenfolge entscheidet: `initiative` steht vor `checks`, sonst
 * verschluckt die allgemeine Regel den Sonderfall. Was hier fehlt, bleibt
 * bewusst ohne Regelbaustein — geraten wird nicht.
 */
const ZIELE: { muster: RegExp; domaenen: string[] }[] = [
  { muster: /\binitiative\b/i, domaenen: ['initiative'] },
  { muster: /\bperception\b/i, domaenen: ['perception'] },
  { muster: /\b(saving throws?|saves?)\b/i, domaenen: ['saving-throw'] },
  // „all challenges in the chase", „checks in the … encounter": Fertigkeiten
  // und Rettungswuerfe. `all` waere zu breit — es traegt auch Ruestungsklasse
  // und Schaden.
  { muster: /\b(checks?|challenges?)\b/i, domaenen: ['skill-check', 'saving-throw'] },
];

/** Zerlegt einen Absatz in Saetze. Grob, aber fuer diesen Zweck genau genug. */
function saetze(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=\.)\s+(?=[A-Z*\-])/)
    .map((satz) => satz.trim())
    .filter((satz) => satz !== '');
}

/**
 * Sammelt die Effekte eines Szenarios ein.
 *
 * **Statbloecke bleiben aussen vor.** Auch sie sind voller Boni — die
 * Verteidigung des Leibwaechters, der Zug aus der Flasche des Hafenarbeiters
 * —, aber die gehoeren zur Kreatur und stehen laengst in ihrem Actor. Der
 * Traeger im Satz (`PCs`, `party`, `enemies`) trennt beides zuverlaessig:
 * Statbloecke sprechen von `the target` und `an adjacent ally`.
 */
export function sammleEffekte(blocks: Block[]): Szenarioeffekt[] {
  const gefunden: Szenarioeffekt[] = [];
  const gesehen = new Set<string>();

  for (const block of blocks) {
    if (block.role === 'statblock' || block.role === 'traits') continue;

    for (const satz of saetze(block.text)) {
      if (!BETEILIGTE.test(satz)) continue;
      const treffer = BONUS.exec(satz);
      if (!treffer) continue;

      const vorzeichen = treffer[1] === '+' ? 1 : -1;
      const worauf = treffer[5]!.trim();
      const schluessel = `${vorzeichen}${treffer[2]}|${worauf.toLowerCase()}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);

      gefunden.push({
        satz,
        wert: vorzeichen * Number(treffer[2]),
        art: (treffer[3]?.toLowerCase() as Bonusart) ?? 'untyped',
        domaenen: ZIELE.find((ziel) => ziel.muster.test(worauf))?.domaenen ?? [],
        ziel: /\b(enemies|creatures)\b/i.test(satz) ? 'gegner' : 'gruppe',
        worauf,
        ...(SEITENVERWEIS.exec(worauf) ? { seite: Number(SEITENVERWEIS.exec(worauf)![1]) } : {}),
      });
    }
  }

  return gefunden;
}
