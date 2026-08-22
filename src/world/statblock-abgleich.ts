/**
 * Haelt den abgedruckten Statblock gegen die Kompendium-Vorlage.
 *
 * Der Import kopiert die Vorlage und tauscht den Namen; was das Heft daneben
 * aendert, faellt heute still weg. Diese Datei findet genau diese Stellen —
 * sie **meldet nur**, sie schreibt nichts.
 *
 * Zwei Haelften, absichtlich getrennt:
 *
 * - `abbildAusActor` liest aus den PF2e-Actordaten dieselben Felder, die
 *   `pdf/statblock.ts` aus dem Heft liest. Alle Feldnamen sind an den echten
 *   Kompendiumsdateien unter `_reference/pf2e` abgelesen, keiner aus dem
 *   Gedaechtnis — Foundry verwirft Unbekanntes stillschweigend.
 * - `vergleiche` bekommt zwei reine Objekte und kennt Foundry nicht. Deshalb
 *   laesst sich der ganze Vergleich ohne Mocks testen.
 *
 * Nur `pruefeKreaturen` ganz unten holt die Vorlagen wirklich aus den
 * Kompendien und ist deshalb als einziges nicht ohne Foundry zu haben.
 *
 * Die Schreibweisen gehen auseinander: Das Heft setzt `versatile S`,
 * `thrown 10 feet` und `low-light vision`, das Kompendium `versatile-s`,
 * `thrown-10` und `low-light-vision`. `normalisiere` fuehrt beide auf dieselbe
 * Form. Ohne das meldete jede unveraenderte Kreatur Abweichungen, und der
 * Bericht waere wertlos.
 */
import { gleicheAn, type Angleichwerke } from './angleichen.ts';
import { MODULE_ID } from './flags.ts';
import type { GefundeneKreatur } from '../pdf/journal.ts';
import type { Angriff, Attribut, Fertigkeit, Statblock, Tempo } from '../pdf/statblock.ts';

/** Die Vorlage in derselben Form, in der der Statblock gelesen wird. */
export interface Vorlagenabbild {
  name: string;
  stufe?: number;
  merkmale: string[];
  perception?: number;
  sinne: string[];
  sprachen: string[];
  fertigkeiten: Fertigkeit[];
  attribute: Partial<Record<Attribut, number>>;
  ac?: number;
  rettungswuerfe: { fort?: number; ref?: number; will?: number };
  tp?: number;
  tempo?: Tempo;
  angriffe: Angriff[];
  faehigkeiten: string[];
}

/**
 * Die Groessenschluessel des Systems in der Schreibung des Hefts.
 *
 * Das Kompendium fuehrt `med`, die Merkmalsplakette druckt `MEDIUM`. Ohne
 * diese Tabelle meldete **jede** Kreatur eine Abweichung in den Merkmalen.
 */
const GROESSE: Record<string, string> = {
  tiny: 'tiny',
  sm: 'small',
  med: 'medium',
  lg: 'large',
  huge: 'huge',
  grg: 'gargantuan',
};

/**
 * Merkmale, die nur eine der beiden Seiten fuehrt und die deshalb aus dem
 * Vergleich fallen.
 *
 * `unarmed` steht im Kompendium an jeder Klaue und jeder Faust, im Heft aber
 * nur manchmal — an der Season 8 gemessen bei Twigjack, Sprigjack und Wight
 * nicht. Das ist eine Satzgewohnheit, keine Regelaussage, und es hat in der
 * Eichung mehr Fehlalarm erzeugt als alles andere.
 */
const STUMME_MERKMALE = new Set(['unarmed']);

/** Ein Feld, in dem Heft und Vorlage auseinandergehen. */
export interface Abweichung {
  /** Sprachschluessel des Feldnamens, ohne Praefix — `Merkmale`, `Angriffe`. */
  feld: string;
  /** Was im Heft steht. */
  heft: string;
  /** Was die Vorlage sagt. */
  vorlage: string;
}

/**
 * Fuehrt eine Schreibweise aus Heft oder Kompendium auf eine gemeinsame Form.
 *
 * `versatile S` und `versatile-s` sind dasselbe Merkmal, `thrown 10 feet` und
 * `thrown-10` auch, `two-hand 1d8` und `two-hand-d8` ebenso. Kleingeschrieben,
 * `feet` weg, Wuerfelzahl vor dem `d` weg, Leerzeichen zu Bindestrichen.
 */
export function normalisiere(wort: string): string {
  return wort
    .toLowerCase()
    .replace(/[–—]/g, '-')
    // Das PDF setzt den typografischen Apostroph, das Kompendium den geraden:
    // `Bodyguard’s Reprisal` gegen `Bodyguard's Reprisal`. Ohne diese Zeile
    // gilt jede Faehigkeit mit Apostroph als fehlend.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\b(\d+)d(\d+)\b/g, 'd$2')
    .replace(/\bfeet\b|\bfoot\b/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function alsListe(werte: readonly string[]): string {
  return werte.length === 0 ? '—' : werte.join(', ');
}

function gleicheMenge(a: readonly string[], b: readonly string[]): boolean {
  const einheitlich = (werte: readonly string[]): string[] =>
    [...new Set(werte.map(normalisiere))].filter((wert) => !STUMME_MERKMALE.has(wert)).sort();
  const einA = einheitlich(a);
  const einB = einheitlich(b);
  return einA.length === einB.length && einA.every((wert, i) => wert === einB[i]);
}

/**
 * Der Name einer Faehigkeit ohne den Klammerzusatz, den das Kompendium
 * anhaengt: `Construct Armor (Hardness 2)` ist dieselbe Faehigkeit wie
 * `Construct Armor` im Heft.
 */
function faehigkeitsName(name: string): string {
  return normalisiere(name.replace(/\s*\([^)]*\)\s*$/, ''));
}

/** `acrobatics` → `Acrobatics`, nur fuer die Anzeige im Bericht. */
function grossAnfang(text: string): string {
  return text.replace(/(^|[\s-])(\p{Ll})/gu, (_, davor: string, buchstabe: string) => davor + buchstabe.toUpperCase());
}

/* ------------------------------------------------------------------ *
 * Vorlage lesen
 * ------------------------------------------------------------------ */

/** Die Actordaten, wie `toObject()` sie liefert — nur lose beschrieben. */
type Rohdaten = Record<string, unknown>;

function objekt(wert: unknown): Rohdaten {
  return wert && typeof wert === 'object' ? (wert as Rohdaten) : {};
}

function zahlOder(wert: unknown): number | undefined {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined;
}

function texte(wert: unknown): string[] {
  return Array.isArray(wert) ? wert.filter((eintrag): eintrag is string => typeof eintrag === 'string') : [];
}

/**
 * Fernkampf erkennt man an `range`, nicht am Dokumenttyp: Ein NSC-Angriff ist
 * in PF2e **immer** ein Item vom Typ `melee`, auch die Armbrust. Was ihn zum
 * Fernkampfangriff macht, ist ein gesetztes `system.range` oder ein
 * Wurfmerkmal (`thrown-10`).
 */
function angriffsart(system: Rohdaten): Angriff['art'] {
  if (objekt(system['range'])['increment'] !== undefined) return 'ranged';
  const merkmale = texte(objekt(system['traits'])['value']);
  return merkmale.some((m) => m.startsWith('thrown')) ? 'ranged' : 'melee';
}

/**
 * Die Merkmale eines Angriffs so, wie das Heft sie druckt.
 *
 * Die Reichweite steht im Kompendium in `system.range` statt unter den
 * Merkmalen; im Heft steht sie als `range increment 60 feet` in der Klammer.
 * Damit beide Seiten vergleichbar werden, wird sie hier zurueckuebersetzt.
 */
function angriffsmerkmale(system: Rohdaten): string[] {
  const merkmale = texte(objekt(system['traits'])['value']);
  const reichweite = zahlOder(objekt(system['range'])['increment']);
  return reichweite === undefined ? merkmale : [...merkmale, `range-increment-${reichweite}`];
}

function ersterSchaden(system: Rohdaten): { formel?: string; art?: string } {
  const wuerfe = Object.values(objekt(system['damageRolls']));
  const erster = objekt(wuerfe[0]);
  const formel = typeof erster['damage'] === 'string' ? erster['damage'] : undefined;
  const art = typeof erster['damageType'] === 'string' ? erster['damageType'] : undefined;
  return { ...(formel ? { formel } : {}), ...(art ? { art } : {}) };
}

/**
 * Liest die Felder eines PF2e-Actors, wie `toObject()` sie liefert.
 *
 * Belegt an den Dateien unter `_reference/pf2e/packs/pf2e/…`:
 * `system.traits.value` und `.size.value` fuer die Merkmalsplakette,
 * `system.perception.mod`/`.senses`, `system.details.languages.value`,
 * `system.skills` (Lore-Fertigkeiten stehen dagegen als eigene Items vom Typ
 * `lore` mit `system.mod.value`), `system.attributes.ac.value`/`.hp.max`/
 * `.speed`, `system.saves`, `system.abilities`.
 */
export function abbildAusActor(daten: Rohdaten): Vorlagenabbild {
  const system = objekt(daten['system']);
  const traits = objekt(system['traits']);
  const attributes = objekt(system['attributes']);
  const details = objekt(system['details']);
  const items = Array.isArray(daten['items']) ? (daten['items'] as Rohdaten[]) : [];

  const groesse = objekt(traits['size'])['value'];
  const seltenheit = traits['rarity'];
  const merkmale = [
    // Die Plakette im Heft nennt Seltenheit und Groesse vor den Merkmalen —
    // `RARE SMALL CONSTRUCT HUMANOID`. `common` wird nie gedruckt.
    ...(typeof seltenheit === 'string' && seltenheit !== 'common' ? [seltenheit] : []),
    ...(typeof groesse === 'string' ? [GROESSE[groesse] ?? groesse] : []),
    ...texte(traits['value']),
  ];

  const fertigkeiten: Fertigkeit[] = [];
  for (const [name, wert] of Object.entries(objekt(system['skills']))) {
    const mod = zahlOder(objekt(wert)['base']);
    if (mod !== undefined) fertigkeiten.push({ name, mod });
  }
  for (const item of items) {
    if (item['type'] !== 'lore') continue;
    const mod = zahlOder(objekt(objekt(item['system'])['mod'])['value']);
    if (mod !== undefined) fertigkeiten.push({ name: String(item['name'] ?? ''), mod });
  }

  const attribute: Partial<Record<Attribut, number>> = {};
  for (const [name, wert] of Object.entries(objekt(system['abilities']))) {
    const mod = zahlOder(objekt(wert)['mod']);
    if (mod !== undefined) attribute[name as Attribut] = mod;
  }

  const saves = objekt(system['saves']);
  const rettungswuerfe: Vorlagenabbild['rettungswuerfe'] = {};
  for (const [kurz, lang] of [
    ['fort', 'fortitude'],
    ['ref', 'reflex'],
    ['will', 'will'],
  ] as const) {
    const mod = zahlOder(objekt(saves[lang])['value']);
    if (mod !== undefined) rettungswuerfe[kurz] = mod;
  }

  const speed = objekt(attributes['speed']);
  const weitere = Array.isArray(speed['otherSpeeds'])
    ? (speed['otherSpeeds'] as Rohdaten[]).map(
        (art) => `${String(art['type'] ?? '')} ${String(art['value'] ?? '')}`.trim(),
      )
    : [];
  const gehen = zahlOder(speed['value']);

  const angriffe: Angriff[] = [];
  const faehigkeiten: string[] = [];
  for (const item of items) {
    const itemSystem = objekt(item['system']);
    if (item['type'] === 'melee') {
      const { formel, art } = ersterSchaden(itemSystem);
      angriffe.push({
        art: angriffsart(itemSystem),
        name: String(item['name'] ?? ''),
        mod: zahlOder(objekt(itemSystem['bonus'])['value']) ?? 0,
        merkmale: angriffsmerkmale(itemSystem),
        ...(formel ? { formel } : {}),
        ...(art ? { schadensart: art } : {}),
      });
    } else if (item['type'] === 'action' || item['type'] === 'spellcastingEntry') {
      // Die Zauberliste heisst im Heft `Arcane Prepared Spells` und steht dort
      // zwischen den Faehigkeiten; im Kompendium ist sie ein eigener Itemtyp.
      faehigkeiten.push(String(item['name'] ?? ''));
    }
  }

  const sinne = Array.isArray(system['perception'] && objekt(system['perception'])['senses'])
    ? (objekt(system['perception'])['senses'] as unknown[]).map((sinn) =>
        typeof sinn === 'string' ? sinn : String(objekt(sinn)['type'] ?? ''),
      )
    : [];

  return {
    name: String(daten['name'] ?? ''),
    ...(zahlOder(objekt(details['level'])['value']) === undefined
      ? {}
      : { stufe: zahlOder(objekt(details['level'])['value'])! }),
    merkmale,
    ...(zahlOder(objekt(system['perception'])['mod']) === undefined
      ? {}
      : { perception: zahlOder(objekt(system['perception'])['mod'])! }),
    sinne: sinne.filter((sinn) => sinn !== ''),
    sprachen: texte(objekt(details['languages'])['value']),
    fertigkeiten,
    attribute,
    ...(zahlOder(objekt(attributes['ac'])['value']) === undefined
      ? {}
      : { ac: zahlOder(objekt(attributes['ac'])['value'])! }),
    rettungswuerfe,
    ...(zahlOder(objekt(attributes['hp'])['max']) === undefined
      ? {}
      : { tp: zahlOder(objekt(attributes['hp'])['max'])! }),
    ...(gehen === undefined && weitere.length === 0
      ? {}
      : { tempo: { ...(gehen === undefined ? {} : { wert: gehen }), weitere } }),
    angriffe,
    faehigkeiten,
  };
}

/* ------------------------------------------------------------------ *
 * Vergleichen
 * ------------------------------------------------------------------ */

/**
 * Ein Angriff als eine Zeile, wie das Heft ihn druckt — mit der Kampfart
 * davor. Die gehoert sichtbar dazu: Beim Bodyguard in 8-04 steht der
 * Schleuderangriff unter `Melee`, im Kompendium unter Fernkampf.
 */
function zeigeAngriff(angriff: Angriff): string {
  const art = angriff.art === 'melee' ? 'Melee' : 'Ranged';
  const merkmale = angriff.merkmale.length > 0 ? ` (${angriff.merkmale.join(', ')})` : '';
  const schaden = angriff.formel ? ` ${angriff.formel} ${angriff.schadensart ?? ''}`.trimEnd() : '';
  return `${art} ${angriff.name} ${angriff.mod >= 0 ? '+' : ''}${angriff.mod}${merkmale}${schaden}`;
}

/**
 * Paart die Angriffe und meldet, was auseinandergeht.
 *
 * Gepaart wird ueber den **Namen**, nicht ueber die Reihenfolge: Das Heft setzt
 * Nahkampf vor Fernkampf, das Kompendium sortiert nach `sort`. Ein Vergleich
 * Position gegen Position meldete Unterschiede, wo keine sind — ueber den Namen
 * faellt dagegen genau das auf, worum es geht: `fist` wird zu `claw`.
 *
 * Zwei Durchgaenge, und der zweite ist der Grund fuer diese Aufteilung: Erst
 * wird auf Kampfart **und** Namen gepaart, dann auf den blossen Namen. So wird
 * aus dem Schleuderangriff des Bodyguards eine Zeile „hier Nahkampf, dort
 * Fernkampf" statt zweier Zeilen „fehlt" und „ueberzaehlig".
 */
function vergleicheAngriffe(
  heft: Angriff[],
  vorlage: Angriff[],
  zahlenPruefen: boolean,
): Abweichung[] {
  const abweichungen: Abweichung[] = [];
  const offen = [...vorlage];

  const nimm = (passt: (kandidat: Angriff) => boolean): Angriff | undefined => {
    const i = offen.findIndex(passt);
    return i === -1 ? undefined : offen.splice(i, 1)[0];
  };

  const ungepaart: Angriff[] = [];
  const paare: Array<[Angriff, Angriff]> = [];

  for (const angriff of heft) {
    const name = normalisiere(angriff.name);
    const gegenstueck = nimm((k) => k.art === angriff.art && normalisiere(k.name) === name);
    if (gegenstueck) paare.push([angriff, gegenstueck]);
    else ungepaart.push(angriff);
  }

  for (const angriff of ungepaart) {
    const name = normalisiere(angriff.name);
    const gegenstueck = nimm((k) => normalisiere(k.name) === name);
    if (gegenstueck) paare.push([angriff, gegenstueck]);
    else abweichungen.push({ feld: 'Angriff', heft: zeigeAngriff(angriff), vorlage: '—' });
  }

  for (const [angriff, gegenstueck] of paare) {
    // Angriffsbonus und Schadenswuerfel zieht die Elite-Anpassung selbst nach;
    // Kampfart, Schadensart und Merkmale nicht — dort steckt der Unterschied,
    // um den es geht (die Klaue des Captain Ashfell schneidet, die Faust wuchtet).
    const gleich =
      angriff.art === gegenstueck.art &&
      (!zahlenPruefen ||
        (angriff.mod === gegenstueck.mod &&
          normalisiere(angriff.formel ?? '') === normalisiere(gegenstueck.formel ?? ''))) &&
      normalisiere(angriff.schadensart ?? '') === normalisiere(gegenstueck.schadensart ?? '') &&
      gleicheMenge(angriff.merkmale, gegenstueck.merkmale);
    if (!gleich) {
      abweichungen.push({
        feld: 'Angriff',
        heft: zeigeAngriff(angriff),
        vorlage: zeigeAngriff(gegenstueck),
      });
    }
  }

  for (const angriff of offen) {
    abweichungen.push({ feld: 'Angriff', heft: '—', vorlage: zeigeAngriff(angriff) });
  }

  return abweichungen;
}

function zeigeFertigkeit(fertigkeit: Fertigkeit): string {
  return `${fertigkeit.name} ${fertigkeit.mod >= 0 ? '+' : ''}${fertigkeit.mod}`;
}

/**
 * Findet die Felder, in denen der abgedruckte Statblock von seiner Vorlage
 * abweicht.
 *
 * **Nicht** verglichen werden Gegenstaende sowie Immunitaeten, Schwaechen und
 * Resistenzen. Beide fuehren im Kompendium eigene Schluessel, die sich nicht
 * verlaesslich auf den Wortlaut des Hefts zurueckrechnen lassen — aus `axes 5`
 * wird dort `axe-vulnerability`, aus `padded armor` ein eigenes Item mit
 * anderem Namen. Sie zu vergleichen erzeugte Fehlalarm bei jeder
 * unveraenderten Kreatur; das machte den Bericht wertlos. Wer sie braucht,
 * muss erst eine belastbare Zuordnung bauen.
 */
export function vergleiche(
  heft: Statblock,
  vorlage: Vorlagenabbild,
  optionen: { anpassung?: 'elite' | 'weak' } = {},
): Abweichung[] {
  const abweichungen: Abweichung[] = [];

  /**
   * Bei Elite und Schwach sind alle Zahlen erwartungsgemaess anders — das
   * PF2e-System rechnet sie beim Import selbst nach (`applyAdjustment`).
   * Wuerden sie hier gemeldet, bestuende der Bericht fuer `Burr` aus zwoelf
   * Zeilen, von denen keine einzige ein Problem waere.
   */
  const zahlenPruefen = optionen.anpassung === undefined;

  const melde = (feld: string, a: string, b: string): void => {
    if (a !== b) abweichungen.push({ feld, heft: a, vorlage: b });
  };

  if (!gleicheMenge(heft.merkmale, vorlage.merkmale)) {
    abweichungen.push({
      feld: 'Merkmale',
      heft: alsListe(heft.merkmale),
      vorlage: alsListe(vorlage.merkmale),
    });
  }

  if (!gleicheMenge(heft.sinne, vorlage.sinne)) {
    abweichungen.push({
      feld: 'Sinne',
      heft: alsListe(heft.sinne),
      vorlage: alsListe(vorlage.sinne),
    });
  }

  if (!gleicheMenge(heft.sprachen, vorlage.sprachen)) {
    abweichungen.push({
      feld: 'Sprachen',
      heft: alsListe(heft.sprachen),
      vorlage: alsListe(vorlage.sprachen),
    });
  }

  const zahlig = (wert: number | undefined): string => (wert === undefined ? '—' : String(wert));

  // Das Tempo bleibt auch bei Elite und Schwach gleich — es ist der einzige
  // Zahlenwert, den die Anpassung nicht anfasst, und beim Dwarf Rigger genau
  // der Unterschied (25 statt 30).
  melde('Tempo', zahlig(heft.tempo?.wert), zahlig(vorlage.tempo?.wert));

  if (zahlenPruefen) {
    melde('Wahrnehmung', zahlig(heft.perception), zahlig(vorlage.perception));
    melde('Ruestung', zahlig(heft.ac), zahlig(vorlage.ac));
    melde('Trefferpunkte', zahlig(heft.tp), zahlig(vorlage.tp));

    for (const [kurz, name] of [
      ['fort', 'Zaehigkeit'],
      ['ref', 'Reflex'],
      ['will', 'Wille'],
    ] as const) {
      melde(name, zahlig(heft.rettungswuerfe[kurz]), zahlig(vorlage.rettungswuerfe[kurz]));
    }

    // Feldnamen ausgeschrieben statt ueber `toUpperCase()` gebaut: nur so
    // sieht `tools/pruefe.mjs`, dass jeder von ihnen uebersetzt ist.
    for (const [attribut, feld] of [
      ['str', 'STR'],
      ['dex', 'DEX'],
      ['con', 'CON'],
      ['int', 'INT'],
      ['wis', 'WIS'],
      ['cha', 'CHA'],
    ] as const) {
      melde(feld, zahlig(heft.attribute[attribut]), zahlig(vorlage.attribute[attribut]));
    }

    // Fertigkeiten ueber den Namen paaren — das Kompendium sortiert anders als
    // das Heft, und Lore-Fertigkeiten stehen dort als eigene Items.
    const vorlagenFertigkeiten = new Map(vorlage.fertigkeiten.map((f) => [normalisiere(f.name), f]));
    for (const fertigkeit of heft.fertigkeiten) {
      const gegenstueck = vorlagenFertigkeiten.get(normalisiere(fertigkeit.name));
      if (!gegenstueck) {
        abweichungen.push({ feld: 'Fertigkeit', heft: zeigeFertigkeit(fertigkeit), vorlage: '—' });
      } else if (gegenstueck.mod !== fertigkeit.mod) {
        abweichungen.push({
          feld: 'Fertigkeit',
          heft: zeigeFertigkeit(fertigkeit),
          vorlage: zeigeFertigkeit({ ...gegenstueck, name: grossAnfang(gegenstueck.name) }),
        });
      }
    }
    const heftFertigkeiten = new Set(heft.fertigkeiten.map((f) => normalisiere(f.name)));
    for (const fertigkeit of vorlage.fertigkeiten) {
      if (!heftFertigkeiten.has(normalisiere(fertigkeit.name))) {
        abweichungen.push({
          feld: 'Fertigkeit',
          heft: '—',
          vorlage: zeigeFertigkeit({ ...fertigkeit, name: grossAnfang(fertigkeit.name) }),
        });
      }
    }
  }

  abweichungen.push(...vergleicheAngriffe(heft.angriffe, vorlage.angriffe, zahlenPruefen));

  // Faehigkeiten werden **einseitig** geprueft: Gemeldet wird nur, was das Heft
  // nennt und die Vorlage nicht hat — denn nur das ginge beim Import verloren.
  // Umgekehrt fuehrt die Vorlage regelmaessig mehr, weil das Heft manches in
  // eine andere Zeile setzt (`void healing` steht dort bei den Trefferpunkten).
  // Verglichen wird nur der Name: Der Wortlaut des Hefts und der des
  // Kompendiums gehen fast immer auseinander, ohne dass es etwas bedeutet.
  const vorhandene = new Set(vorlage.faehigkeiten.map(faehigkeitsName));
  const fehlend = heft.faehigkeiten
    .map((faehigkeit) => faehigkeit.name)
    .filter((name) => !vorhandene.has(faehigkeitsName(name)));
  if (fehlend.length > 0) {
    abweichungen.push({
      feld: 'Faehigkeiten',
      heft: alsListe(fehlend),
      vorlage: '—',
    });
  }

  return abweichungen;
}

/* ------------------------------------------------------------------ *
 * Vorlagen holen — der einzige Teil, der Foundry braucht
 * ------------------------------------------------------------------ */

/** Was der Abgleich einer Kreatur ergeben hat. */
export interface KreaturAbgleich {
  /** Name des Statblocks, wie er im Heft steht. */
  name: string;
  /** Name der Vorlage im Kompendium. */
  vorlage: string;
  abweichungen: Abweichung[];
  /** Was sich nicht anwenden liess; nur gesetzt, wenn angeglichen wird. */
  ungenutzt?: string[];
}

/** Ergebnis des Durchlaufs: die Berichte und die angeglichenen Daten. */
export interface Kreaturenpruefung {
  berichte: KreaturAbgleich[];
  /**
   * Die angeglichenen Actordaten je Kreatur.
   *
   * Ueber das Fundobjekt selbst verschluesselt, nicht ueber den Namen: Zwei
   * Fassungen derselben Vorlage koennen gleich heissen, und der Plan haelt
   * ohnehin dieselben Objekte in der Hand.
   */
  daten: Map<GefundeneKreatur, Record<string, unknown>>;
}

/**
 * Haelt jede gefundene Kreatur gegen ihre Kompendium-Vorlage.
 *
 * Uebersprungen wird, wofuer es nichts zu vergleichen gibt: Kreaturen ohne
 * abgedruckten Statblock (sie stehen nur in der Begegnungsliste) und
 * Kompendiumseintraege, die sich nicht laden lassen. Beides ist kein Fehler
 * und wird deshalb nicht gemeldet — die fehlende Vorlage meldet bereits
 * `sammleKreaturen`.
 *
 * Zurueck kommt nur, was tatsaechlich abweicht. Wer nichts findet, sagt nichts.
 */
export async function pruefeKreaturen(
  kreaturen: readonly GefundeneKreatur[],
  optionen: { angleichen?: boolean; werke?: Angleichwerke } = {},
): Promise<Kreaturenpruefung> {
  const berichte: KreaturAbgleich[] = [];
  const daten = new Map<GefundeneKreatur, Record<string, unknown>>();

  for (const kreatur of kreaturen) {
    if (!kreatur.statblock) continue;

    const uuid = `Compendium.${kreatur.entry.pack}.Actor.${kreatur.entry.id}`;
    let vorlagendaten: Rohdaten | undefined;
    try {
      const quelle = (await foundry.utils.fromUuid(uuid)) as
        | { toObject?: () => Rohdaten }
        | null;
      vorlagendaten = quelle?.toObject?.();
    } catch (fehler) {
      console.warn(`${MODULE_ID} | Vorlage nicht ladbar: ${uuid}`, fehler);
    }
    if (!vorlagendaten) continue;

    const abbild = abbildAusActor(vorlagendaten);
    const anpassung = kreatur.anpassung ? { anpassung: kreatur.anpassung } : {};
    const abweichungen = vergleiche(kreatur.statblock, abbild, anpassung);
    if (abweichungen.length === 0) continue;

    // Angeglichen wird nur, wo es etwas anzugleichen gibt. Die Vorlage
    // unveraendert als `daten` durchzureichen waere zwar dasselbe Ergebnis,
    // machte aber aus jeder Kreatur einen Sonderfall im Plan.
    if (!optionen.angleichen) {
      berichte.push({ name: kreatur.name, vorlage: kreatur.entry.name, abweichungen });
      continue;
    }

    const angeglichen = gleicheAn(vorlagendaten, kreatur.statblock, abbild, {
      ...anpassung,
      ...(optionen.werke ? { werke: optionen.werke } : {}),
    });
    daten.set(kreatur, angeglichen.daten);
    berichte.push({
      name: kreatur.name,
      vorlage: kreatur.entry.name,
      abweichungen,
      ungenutzt: angeglichen.ungenutzt,
    });
  }

  return { berichte, daten };
}
