/**
 * Liest den **abgedruckten** Statblock eines Szenarios.
 *
 * Wozu, wenn die Kreaturen doch aus den Kompendien kommen? Weil das Heft die
 * Vorlage veraendert. An der ganzen Season 8 gemessen: sechzehn Statbloecke,
 * davon elf Kreaturen — und **alle elf** nennen eine Kompendium-Vorlage. Zwei
 * davon weichen von ihr ab:
 *
 * - `Dwarf Rigger` ist der Rigger mit der Zwergen-Vorlage — Merkmal `dwarf`
 *   statt `human`, Dunkelsicht, Zwergisch, ein Sippendolch dazu.
 * - `Captain Ashfell Grimme` ist der Pirat als Changeling — Merkmal dazu,
 *   Daemmersicht, und die Faust ist eine Klaue mit anderer Schadensart.
 *
 * Alles Zahlenmaessige stimmt in beiden Faellen ueberein. Der Import kopiert
 * heute nur die Vorlage; diese Abweichungen fallen still weg. Damit sie
 * auffallen koennen, muessen sie erst einmal gelesen werden — das ist die
 * Aufgabe dieser Datei. Sie **entscheidet nichts** und kennt Foundry nicht.
 *
 * Der Satz ist dabei die ganze Grammatik: Ein Statblock ist eine Folge von
 * `**Etikett** Wert`. Was hier steht, ist deshalb keine Sprachanalyse, sondern
 * das Einsortieren dieser Etiketten.
 */
import { parseCreatureHeading, type CreatureHeading } from './actors.ts';
import { titleCase } from './text.ts';
import type { Block } from './types.ts';

/**
 * Die Kopfzeile, wie `parseCreatureHeading` sie erwartet.
 *
 * Im Heft steht sie in Versalien (`DWARF RIGGER CREATURE 1`), der Leser sucht
 * aber nach `Creature` in gemischter Schreibung. Ohne diesen Schritt findet er
 * nichts — und zwar lautlos.
 */
function kopfzeile(text: string): string {
  return titleCase(text.replace(/\s+/g, ' ').trim());
}

/** Ein Etikett samt dem Text bis zum naechsten Etikett. */
export interface Abschnitt {
  etikett: string;
  text: string;
}

export interface Fertigkeit {
  name: string;
  mod: number;
  /** Der Klammerzusatz, etwa `+10 to Climb`. */
  zusatz?: string;
}

export type Attribut = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/**
 * Eine benannte Faehigkeit — `Rope Tension Spring`, `Utter Consumption`.
 *
 * Bis zum Gefahrenbau reichte der Name: Kreaturen bringen ihre Faehigkeiten
 * aus dem Kompendium mit, verglichen wurde nur, ob eine fehlt. Eine
 * szenarioeigene Gefahr hat dagegen **kein** Gegenstueck im Kompendium — ihr
 * Text ist das Einzige, was es von ihr gibt, und muss deshalb erhalten
 * bleiben.
 */
export interface Faehigkeit {
  /** Der Name im Wortlaut des Hefts. */
  name: string;
  /**
   * Die Aktionsplakette, wie sie im Heft hinter dem Namen steht —
   * `reaction`, `two-actions`, `free-action`. Fehlt sie, ist die Faehigkeit
   * passiv.
   */
  plakette?: string;
  /** Merkmale in der Klammer dahinter — `(manipulate, move)`. */
  merkmale: string[];
  /** Der ganze uebrige Text der Faehigkeit, samt ihrer Unterpunkte. */
  text: string;
}

export interface Angriff {
  art: 'melee' | 'ranged';
  /** Name der Waffe, kleingeschrieben wie im Heft — `clan dagger`, `claw`. */
  name: string;
  mod: number;
  /** Waffenmerkmale aus der Klammer, kleingeschrieben. */
  merkmale: string[];
  /** Die Schadenszeile im Wortlaut — `1d4+4 slashing`, `2d6+7 piercing plus 2d6 void`. */
  schaden?: string;
  /** Erster Wuerfelausdruck der Schadenszeile. */
  formel?: string;
  /** Erste Schadensart der Schadenszeile. */
  schadensart?: string;
}

export interface Tempo {
  /** Gehgeschwindigkeit in Fuss. */
  wert?: number;
  /** Weitere Bewegungsarten im Wortlaut — `fly 30 feet`. */
  weitere: string[];
}

export interface Statblock {
  /** Die Kopfzeile im Wortlaut — `DWARF RIGGER CREATURE 1`. */
  kopf: string;
  /** Name ohne Art und Stufe, in der Schreibung der Kopfzeile. */
  name: string;
  stufe: number;
  art: CreatureHeading['kind'];
  /** Merkmalsplaketten, kleingeschrieben: `['medium', 'dwarf', 'humanoid']`. */
  merkmale: string[];
  /** Die Quellenzeile vor dem ersten Etikett, im Wortlaut. */
  quelle?: string;

  perception?: number;
  /** Sinne hinter der Wahrnehmung — `darkvision`, `low-light vision`. */
  sinne: string[];
  sprachen: string[];
  fertigkeiten: Fertigkeit[];
  attribute: Partial<Record<Attribut, number>>;
  gegenstaende: string[];
  ac?: number;
  /** Was hinter dem AC-Wert steht — `(13 when broken), construct armor`. */
  acZusatz?: string;
  rettungswuerfe: { fort?: number; ref?: number; will?: number };
  tp?: number;
  /** Was hinter den Trefferpunkten steht — `(BT 12)`, `per usher`, `void healing`. */
  tpZusatz?: string;
  haerte?: number;
  immunitaeten: string[];
  schwaechen: string[];
  resistenzen: string[];
  tempo?: Tempo;

  /**
   * Die Felder, die nur Gefahren fuehren. Paizo setzt sie genauso als
   * Etikett wie alles andere; eine Gefahr hat statt Wahrnehmung eine
   * Heimlichkeit und statt Faehigkeiten eine Routine.
   */
  stealth?: string;
  beschreibung?: string;
  entschaerfen?: string;
  routine?: string;
  ruecksetzung?: string;

  angriffe: Angriff[];
  faehigkeiten: Faehigkeit[];

  /**
   * Etiketten, die keinem Feld zugefallen sind — mit ihrem Text.
   *
   * Absichtlich aufgehoben statt verworfen: Nur so laesst sich pruefen, dass
   * der Leser nichts stillschweigend verliert. Wer die Eichung faehrt, sieht
   * hier sofort, welches Etikett noch niemand kennt.
   */
  rest: Abschnitt[];
}

/**
 * Etiketten, die zur davorstehenden Faehigkeit gehoeren und keine neue
 * beginnen. `**Magic Hat** [two-actions] (…) **Frequency** … **Effect** …` ist
 * **eine** Faehigkeit, nicht drei.
 *
 * Dieselbe Liste sagt beim Bau einer Gefahr, wo ein neuer Absatz anfaengt:
 * Was hier eine Fortsetzung ist, ist dort ein eigener Punkt.
 */
export const FORTSETZUNG = new Set(
  [
    'requirements',
    'requirement',
    'effect',
    'trigger',
    'frequency',
    'critical success',
    'success',
    'failure',
    'critical failure',
    'special',
    'prerequisite',
    'duration',
    'maximum duration',
    'onset',
    'range',
    'area',
    'targets',
    'target',
    'saving throw',
    'note',
  ].map((wort) => wort.toLowerCase()),
);

/**
 * Zauberlisten gliedern sich in Grade (`**1st**`, `**Cantrips (1st)**`). Auch
 * das sind Fortsetzungen der Zauberzeile, keine eigenen Faehigkeiten.
 */
const ZAUBERGRAD = /^(\d+(st|nd|rd|th)|cantrips?\b.*|constant\b.*|focus spells?\b.*|stage \d+)$/i;

const ATTRIBUTE: Record<string, Attribut> = {
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
};

/** Vereinheitlicht die Minuszeichen: Paizo setzt Gedankenstriche. */
function zahl(text: string): number | undefined {
  const treffer = /^[+–—-]?\s*\d+/.exec(text.trim().replace(/[–—]/g, '-'));
  if (!treffer) return undefined;
  const wert = Number(treffer[0].replace(/\s+/g, ''));
  return Number.isFinite(wert) ? wert : undefined;
}

/**
 * Zahl **und** was dahinter noch steht.
 *
 * `15 (13 when broken), construct armor` ist eine 15 mit einem Zusatz, `10 per
 * usher` eine 10 mit einem. Der Zusatz wird aufgehoben statt verworfen: Er
 * gehoert spaeter in den Abgleich, und stumm Weggelassenes faellt niemandem
 * auf.
 */
function zahlMitZusatz(text: string): { wert?: number; zusatz?: string } {
  const bereinigt = text.trim().replace(/[–—]/g, '-');
  const treffer = /^[+-]?\s*\d+/.exec(bereinigt);
  if (!treffer) return bereinigt === '' ? {} : { zusatz: bereinigt };
  const wert = Number(treffer[0].replace(/\s+/g, ''));
  const zusatz = bereinigt.slice(treffer[0].length).replace(/^[;,]\s*/, '').trim();
  return {
    ...(Number.isFinite(wert) ? { wert } : {}),
    ...(zusatz === '' ? {} : { zusatz }),
  };
}

/**
 * Trennt an Kommas, aber nicht innerhalb von Klammern.
 *
 * `Athletics +7 (+10 to Climb), Sailing Lore +6` sind zwei Fertigkeiten, nicht
 * drei — das Komma im Klammerzusatz darf nicht trennen.
 */
export function teileOben(text: string, trenner = ','): string[] {
  const stuecke: string[] = [];
  let tiefe = 0;
  let laufend = '';
  for (const zeichen of text) {
    if (zeichen === '(') tiefe++;
    else if (zeichen === ')') tiefe = Math.max(0, tiefe - 1);
    if (zeichen === trenner && tiefe === 0) {
      stuecke.push(laufend.trim());
      laufend = '';
      continue;
    }
    laufend += zeichen;
  }
  stuecke.push(laufend.trim());
  return stuecke.filter((stueck) => stueck !== '');
}

/**
 * Zerlegt den Statblocktext in seine Etiketten.
 *
 * Was vor dem ersten Etikett steht, ist die Quellenzeile und bekommt das leere
 * Etikett. Alles danach faellt dem zuletzt gesehenen Etikett zu.
 *
 * Satzzeichen am Rand des Etiketts fallen weg. Anlass ist der Wight in 8-03:
 * dort steht `**AC** 18**; Fort** +11` — das Semikolon, das eigentlich zum
 * Wert davor gehoert, steht mit im Fettsatz. Ohne diese Bereinigung hiesse das
 * Etikett `; Fort` und der Rettungswurf ginge verloren. Das Ausrufezeichen
 * bleibt: `Shh!` ist der Name einer Faehigkeit.
 */
export function zerlegeAbschnitte(text: string): Abschnitt[] {
  const abschnitte: Abschnitt[] = [];
  const marke = /\*\*([^*]+?)\*\*/g;
  let zuletzt = 0;
  let etikett = '';
  let treffer: RegExpExecArray | null;

  while ((treffer = marke.exec(text)) !== null) {
    abschnitte.push({ etikett, text: text.slice(zuletzt, treffer.index).trim() });
    etikett = treffer[1]!.replace(/^[\s;,:]+/, '').replace(/[\s;,:]+$/, '');
    zuletzt = marke.lastIndex;
  }
  abschnitte.push({ etikett, text: text.slice(zuletzt).trim() });

  return abschnitte.filter((abschnitt, i) => i === 0 || abschnitt.etikett !== '');
}

/** `+7 (+10 to Climb)` → Modifikator und Zusatz. */
function leseFertigkeit(stueck: string): Fertigkeit | undefined {
  const treffer = /^(.*?)\s+([+–—-]\s*\d+)\s*(?:\(([^)]*)\))?\s*$/.exec(stueck.trim());
  if (!treffer) return undefined;
  const mod = zahl(treffer[2]!);
  if (mod === undefined) return undefined;
  const zusatz = treffer[3]?.trim();
  return { name: treffer[1]!.trim(), mod, ...(zusatz ? { zusatz } : {}) };
}

/**
 * `[one-action] clan dagger +9 (agile, parry, versatile B),`
 *
 * Die Aktionsplakette und das Komma am Ende gehoeren nicht zum Angriff — das
 * Komma trennt ihn nur von der Schadenszeile, die als eigenes Etikett folgt.
 */
function leseAngriff(art: Angriff['art'], text: string): Angriff | undefined {
  const ohnePlakette = text.trim().replace(/^\[[^\]]*\]\s*/, '');
  const treffer = /^(.*?)\s+([+–—-]\s*\d+)\s*(?:\(([^)]*)\))?\s*,?\s*$/.exec(ohnePlakette);
  if (!treffer) return undefined;
  const mod = zahl(treffer[2]!);
  if (mod === undefined) return undefined;
  return {
    art,
    name: treffer[1]!.trim(),
    mod,
    merkmale: treffer[3] ? teileOben(treffer[3]).map((m) => m.toLowerCase()) : [],
  };
}

/** `2d6+7 piercing plus 2d6 void` → erste Formel und erste Schadensart. */
function leseSchaden(angriff: Angriff, text: string): void {
  angriff.schaden = text.replace(/\s+/g, ' ').trim();
  const treffer = /^(\d+d\d+(?:\s*[+–—-]\s*\d+)?|\d+)\s+([a-z]+)/i.exec(angriff.schaden);
  if (!treffer) return;
  angriff.formel = treffer[1]!.replace(/\s+/g, '');
  angriff.schadensart = treffer[2]!.toLowerCase();
}

/**
 * `[two-actions] (manipulate, move) Der Rest des Textes.`
 *
 * Aktionsplakette und Merkmalsklammer stehen am Anfang und gehoeren nicht zum
 * Text. Beide duerfen fehlen — eine passive Faehigkeit hat keine Plakette.
 */
function leseFaehigkeit(name: string, text: string): Faehigkeit {
  let rest = text.trim();
  let plakette: string | undefined;
  let merkmale: string[] = [];

  const mitPlakette = /^\[([^\]]*)\]\s*/.exec(rest);
  if (mitPlakette) {
    plakette = mitPlakette[1]!.trim();
    rest = rest.slice(mitPlakette[0].length);
  }

  const mitMerkmalen = /^\(([^)]*)\)\s*/.exec(rest);
  if (mitMerkmalen) {
    merkmale = teileOben(mitMerkmalen[1]!).map((m) => m.toLowerCase());
    rest = rest.slice(mitMerkmalen[0].length);
  }

  return {
    name,
    ...(plakette ? { plakette } : {}),
    merkmale,
    text: rest.trim(),
  };
}

/** `25 feet, fly 30 feet` → Gehgeschwindigkeit und der Rest im Wortlaut. */
function leseTempo(text: string): Tempo {
  const stuecke = teileOben(text);
  const erstes = stuecke[0] ?? '';
  if (/^\d/.test(erstes)) {
    const wert = zahl(erstes);
    return { ...(wert === undefined ? {} : { wert }), weitere: stuecke.slice(1) };
  }
  return { weitere: stuecke };
}

/**
 * Baut aus Kopfzeile, Merkmalsplakette und Rumpf einen gelesenen Statblock.
 *
 * `rumpf` ist der zusammengefuegte Text aller Bloecke des Statblocks. Ob sie im
 * PDF die Rolle `statblock` oder `box` tragen, spielt keine Rolle — Paizo setzt
 * Gefahren anders als Kreaturen, meint aber dasselbe.
 */
export function leseStatblock(
  kopf: string,
  merkmalszeile: string,
  rumpf: string,
): Statblock | undefined {
  const gelesen = parseCreatureHeading(kopfzeile(kopf));
  if (!gelesen) return undefined;

  const block: Statblock = {
    kopf: kopf.replace(/\s+/g, ' ').trim(),
    name: gelesen.name,
    stufe: gelesen.level,
    art: gelesen.kind,
    merkmale: merkmalszeile
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(' ')
      .filter((wort) => wort !== ''),
    sinne: [],
    sprachen: [],
    fertigkeiten: [],
    attribute: {},
    gegenstaende: [],
    rettungswuerfe: {},
    immunitaeten: [],
    schwaechen: [],
    resistenzen: [],
    angriffe: [],
    faehigkeiten: [],
    rest: [],
  };

  /**
   * Der Angriff aus dem **unmittelbar** vorigen Abschnitt.
   *
   * Nur er darf eine Schadenszeile annehmen. Deshalb wird er zu Beginn jedes
   * Durchlaufs geleert und allein von `Melee`/`Ranged` wieder gesetzt: So
   * kann keine Schadenszeile an einen weiter oben stehenden Angriff geraten.
   */
  let offenerAngriff: Angriff | undefined;

  /**
   * Wohin der Text der naechsten Fortsetzung gehoert.
   *
   * Fortsetzungen (`Trigger`, `Effect`, die vier Erfolgsgrade) haben keinen
   * eigenen Platz — sie gehoeren immer zum Eintrag davor. Und das kann
   * beides sein: die `Routine` einer Gefahr hat ihre Erfolgsgrade genauso wie
   * eine benannte Faehigkeit.
   */
  let offenerText: ((etikett: string, text: string) => void) | undefined;

  /** Haengt eine Fortsetzung im Wortlaut an einen Text an. */
  const angehaengt = (bisher: string, etikett: string, text: string): string =>
    `${bisher} **${etikett}** ${text}`.trim();

  /** Merkt sich ein Gefahrenfeld als Ziel der naechsten Fortsetzungen. */
  const feldZiel =
    (setze: (wert: string) => void, lies: () => string) =>
    (etikett: string, text: string): void =>
      setze(angehaengt(lies(), etikett, text));

  for (const abschnitt of zerlegeAbschnitte(rumpf)) {
    const vorigerAngriff = offenerAngriff;
    offenerAngriff = undefined;

    const schluessel = abschnitt.etikett.toLowerCase();
    const wert = abschnitt.text.replace(/\s+/g, ' ').trim();
    // Semikolon und Komma am Ende trennen nur zum naechsten Etikett.
    const knapp = wert.replace(/[;,]\s*$/, '');

    if (abschnitt.etikett === '') {
      if (wert !== '') block.quelle = wert;
      continue;
    }

    if (schluessel in ATTRIBUTE) {
      const mod = zahl(knapp);
      if (mod !== undefined) block.attribute[ATTRIBUTE[schluessel]!] = mod;
      continue;
    }

    // Bei der Kreatur steht `**Hardness** 2`, bei der Gefahr der Name des
    // Gegenstands davor: `**Consumed Aeon Stone Hardness** 6`. Das Etikett
    // endet in beiden Faellen auf `Hardness`.
    if (/(^|\s)hardness$/.test(schluessel)) {
      block.haerte = zahl(knapp);
      continue;
    }

    switch (schluessel) {
      case 'perception': {
        // `+6; low-light vision` — vor dem Semikolon der Wert, dahinter Sinne.
        const [kopfteil = '', ...rest] = wert.split(';');
        block.perception = zahl(kopfteil);
        block.sinne = rest.flatMap((teil) => teileOben(teil));
        continue;
      }
      case 'language':
      case 'languages':
        block.sprachen = teileOben(knapp);
        continue;
      case 'skills':
        for (const stueck of teileOben(knapp)) {
          const fertigkeit = leseFertigkeit(stueck);
          if (fertigkeit) block.fertigkeiten.push(fertigkeit);
        }
        continue;
      case 'items':
        block.gegenstaende = teileOben(knapp);
        continue;
      case 'ac': {
        const { wert, zusatz } = zahlMitZusatz(knapp);
        block.ac = wert;
        if (zusatz) block.acZusatz = zusatz;
        continue;
      }
      case 'fort':
        block.rettungswuerfe.fort = zahl(knapp);
        continue;
      case 'ref':
        block.rettungswuerfe.ref = zahl(knapp);
        continue;
      case 'will':
        block.rettungswuerfe.will = zahl(knapp);
        continue;
      case 'hp': {
        const { wert, zusatz } = zahlMitZusatz(knapp);
        block.tp = wert;
        if (zusatz) block.tpZusatz = zusatz;
        continue;
      }
      case 'immunities':
        block.immunitaeten = teileOben(knapp);
        continue;
      // Einzahl und Mehrzahl kommen beide vor: `**Weaknesses** axes 5, fire 5`
      // bei der Kreatur, `**Weakness** vitality 5` bei der Gefahr.
      case 'weakness':
      case 'weaknesses':
        block.schwaechen = teileOben(knapp);
        continue;
      case 'resistance':
      case 'resistances':
        block.resistenzen = teileOben(knapp);
        continue;
      // Die Felder einer Gefahr nehmen Fortsetzungen an: Zur `Routine` gehoeren
      // ihre Erfolgsgrade, zum `Disable` gelegentlich ein `Special`.
      case 'stealth':
        block.stealth = knapp;
        offenerText = feldZiel(
          (w) => (block.stealth = w),
          () => block.stealth ?? '',
        );
        continue;
      case 'description':
        block.beschreibung = wert;
        offenerText = feldZiel(
          (w) => (block.beschreibung = w),
          () => block.beschreibung ?? '',
        );
        continue;
      case 'disable':
        block.entschaerfen = wert;
        offenerText = feldZiel(
          (w) => (block.entschaerfen = w),
          () => block.entschaerfen ?? '',
        );
        continue;
      case 'routine':
        block.routine = wert;
        offenerText = feldZiel(
          (w) => (block.routine = w),
          () => block.routine ?? '',
        );
        continue;
      case 'reset':
        block.ruecksetzung = wert;
        offenerText = feldZiel(
          (w) => (block.ruecksetzung = w),
          () => block.ruecksetzung ?? '',
        );
        continue;
      case 'speed':
        block.tempo = leseTempo(knapp);
        continue;
      case 'melee':
      case 'ranged': {
        const angriff = leseAngriff(schluessel === 'melee' ? 'melee' : 'ranged', wert);
        if (!angriff) {
          block.rest.push(abschnitt);
          continue;
        }
        block.angriffe.push(angriff);
        offenerAngriff = angriff;
        continue;
      }
      case 'damage':
        // Eine Schadenszeile ohne Angriff davor gehoert in den Rest — sie
        // stumm einem fremden Angriff zuzuschlagen waere geraten.
        if (!vorigerAngriff) {
          block.rest.push(abschnitt);
          continue;
        }
        leseSchaden(vorigerAngriff, wert);
        continue;
      default:
        break;
    }

    // Fortsetzungen gehoeren immer zum Eintrag davor, ganz gleich, ob das eine
    // Faehigkeit oder ein Feld war: Auch die `Routine` einer Gefahr hat ihre
    // Erfolgsgrade. Ein Statblock hat keine Faehigkeit namens `Success`, also
    // ist das Etikett allein schon der Beweis.
    if (FORTSETZUNG.has(schluessel) || ZAUBERGRAD.test(abschnitt.etikett)) {
      offenerText?.(abschnitt.etikett, wert);
      continue;
    }

    // Was uebrig bleibt, ist eine benannte Faehigkeit.
    const faehigkeit = leseFaehigkeit(abschnitt.etikett, wert);
    block.faehigkeiten.push(faehigkeit);
    offenerText = (etikett, text) => {
      faehigkeit.text = angehaengt(faehigkeit.text, etikett, text);
    };
  }

  return block;
}

/**
 * Sammelt die Statbloecke eines Hefts aus dem Blockstrom.
 *
 * Die Probe, ob eine Kopfzeile wirklich einen Statblock eroeffnet, ist die
 * **Merkmalsplakette dahinter**. Dieselbe Kopfzeile steht naemlich auch in der
 * Begegnungsliste (`AEON CONSUMPTION HAZARD 1`), dort aber gefolgt von einem
 * Fliesstextblock (`Page 10 **Stealth** +7 (trained)`). Nur der Anhang setzt
 * die Merkmale darunter — an allen zwoelf Statbloecken der Season 8 geprueft.
 */
export function sammleStatbloecke(blocks: Block[]): Statblock[] {
  const gefunden: Statblock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const gelesen = leseStatblockAn(blocks, i);
    if (!gelesen) continue;
    gefunden.push(gelesen.statblock);
    i = gelesen.bisBlock;
  }

  return gefunden;
}

/**
 * Liest den Statblock, der an `index` beginnt — oder gibt nichts zurueck, wenn
 * dort keiner steht.
 *
 * Getrennt von `sammleStatbloecke`, weil `journal.ts` beim Einsammeln der
 * Kreaturen ohnehin schon an jeder Kopfzeile steht und den Statblock dort
 * gleich mitnehmen kann, statt ihn hinterher ueber den Namen wiederzufinden.
 */
export function leseStatblockAn(
  blocks: Block[],
  index: number,
): { statblock: Statblock; bisBlock: number } | undefined {
  const kopf = blocks[index];
  if (!kopf || !parseCreatureHeading(kopfzeile(kopf.text))) return undefined;

  const merkmale = blocks[index + 1];
  if (!merkmale || merkmale.role !== 'traits') return undefined;

  // Der Rumpf reicht bis zur naechsten Ueberschrift gleich welcher Art.
  const rumpf: string[] = [];
  let j = index + 2;
  for (; j < blocks.length; j++) {
    const block = blocks[j]!;
    if (block.role === 'heading' || block.role === 'subheading' || block.role === 'box-heading') {
      break;
    }
    if (block.role === 'traits') break;
    rumpf.push(block.text);
  }

  const statblock = leseStatblock(kopf.text, merkmale.text, rumpf.join('\n\n'));
  return statblock ? { statblock, bisBlock: j - 1 } : undefined;
}
