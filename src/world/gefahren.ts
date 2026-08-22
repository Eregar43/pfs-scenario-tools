/**
 * Baut aus einem abgedruckten Statblock die Actordaten einer PF2e-Gefahr.
 *
 * Warum ausgerechnet Gefahren? An der ganzen Season 8 gemessen nennt **jede**
 * der elf Kreaturen eine Kompendium-Vorlage, aber **keine** der fuenf
 * Gefahren. Sie sind der einzige Fall, in dem es nichts zu kopieren gibt und
 * wirklich gebaut werden muss.
 *
 * Diese Datei **schreibt nichts**. Sie liefert reine Daten und ist deshalb
 * ohne Foundry testbar; ob und wie sie in der Welt landen, entscheidet
 * `plan.ts` und `apply.ts`.
 *
 * Das Schema ist abgelesen, nicht erinnert: `_reference/pf2e/packs/pf2e/
 * hazards/*.json` (53 Stueck) und `src/module/actor/hazard/data.ts` derselben
 * Fassung 8.4.0, die in der Testinstanz laeuft. Das ist keine Formsache —
 * Foundry verwirft unbekannte Felder beim `create` stillschweigend, und ein
 * falscher Feldname faellt sonst erst dem Spielleiter am Tisch auf.
 */
import { foundryId, inlineHtml } from '../pdf/journal.ts';
import { FORTSETZUNG, type Angriff, type Faehigkeit, type Statblock } from '../pdf/statblock.ts';
import { normalisiere } from './statblock-abgleich.ts';

/**
 * Was das System an Schluesseln kennt.
 *
 * Wird von aussen hereingereicht statt hier hinterlegt: Die Listen stehen zur
 * Laufzeit in `CONFIG.PF2E` und wachsen mit jeder Systemfassung. Eine Kopie im
 * Modul waere ab dem naechsten Update falsch — und zwar unbemerkt, weil
 * Foundry unbekannte Werte kommentarlos verwirft. Fehlt eine Liste, wird
 * nicht geprueft und alles durchgelassen.
 */
export interface Schluesselwerke {
  merkmale?: ReadonlySet<string>;
  immunitaeten?: ReadonlySet<string>;
  schwaechen?: ReadonlySet<string>;
  resistenzen?: ReadonlySet<string>;
  /** Merkmale einer benannten Faehigkeit (`CONFIG.PF2E.actionTraits`). */
  aktionsMerkmale?: ReadonlySet<string>;
  /** Merkmale eines Angriffs (`CONFIG.PF2E.npcAttackTraits`). */
  angriffsMerkmale?: ReadonlySet<string>;
}

/**
 * Holt die Schluesselwerke aus dem laufenden System.
 *
 * Der einzige Teil dieser Datei, der Foundry braucht. Fehlt eine Liste — etwa
 * weil ein anderes System laeuft —, bleibt sie leer, und `baueGefahr` prueft
 * dann nicht, statt alles zu verwerfen.
 */
export function schluesselwerkeAusSystem(): Schluesselwerke {
  const pf2e = CONFIG?.PF2E;
  const schluessel = (werk: Record<string, string> | undefined): ReadonlySet<string> | undefined =>
    werk ? new Set(Object.keys(werk)) : undefined;

  const nimm = (
    name: keyof Schluesselwerke,
    werk: Record<string, string> | undefined,
  ): Partial<Schluesselwerke> => {
    const menge = schluessel(werk);
    return menge ? { [name]: menge } : {};
  };

  return {
    ...nimm('merkmale', pf2e?.hazardTraits),
    ...nimm('immunitaeten', pf2e?.immunityTypes),
    ...nimm('schwaechen', pf2e?.weaknessTypes),
    ...nimm('resistenzen', pf2e?.resistanceTypes),
    ...nimm('aktionsMerkmale', pf2e?.actionTraits),
    ...nimm('angriffsMerkmale', pf2e?.npcAttackTraits),
  };
}

export interface GebauteGefahr {
  /** Die Actordaten, wie `Actor.create` sie erwartet. */
  daten: Record<string, unknown>;
  /**
   * Was der Statblock hergab, aber nicht untergebracht werden konnte.
   *
   * Das gehoert in die Vorschau. Stillschweigend wegzulassen waere hier
   * besonders heimtueckisch: Die Gefahr entstuende trotzdem, saehe richtig
   * aus und waere an einer Stelle falsch, die niemand nachprueft.
   */
  ungenutzt: string[];
}

/**
 * Woerter der Merkmalsplakette, die **kein** Systemmerkmal sind.
 *
 * `complex` wird zu `details.isComplex` — es steht in der Plakette, ist im
 * System aber ein eigenes Feld. `hazard` ist das Gattungswort der Zeile und
 * kommt in keiner der 53 mitgelieferten Gefahren als Merkmal vor; es
 * mitzuschreiben ergaebe ein Merkmal, das das System nicht kennt.
 */
const KEINE_MERKMALE = new Set(['complex', 'hazard']);

/** Seltenheiten stehen in der Plakette, im System aber in einem eigenen Feld. */
const SELTENHEITEN = new Set(['common', 'uncommon', 'rare', 'unique']);

/**
 * Schluessel, bei denen der Wortlaut des Hefts nicht einfach zum Schluessel
 * wird.
 *
 * Das Heft schreibt `precision damage`, das System kennt nur `precision` —
 * anders als bei `area damage`, das als `area-damage` gefuehrt wird. Eine
 * allgemeine Regel gibt es dafuer nicht, deshalb die Tabelle. Was hier fehlt
 * und das System nicht kennt, wird gemeldet und nicht geschrieben.
 */
const IWR_SONDERFALL: Record<string, string> = {
  'precision-damage': 'precision',
};

/**
 * Merkmale, die im Heft anders heissen als im System.
 *
 * `audible` steht so bei `Shh!` in 8-03. Das System kennt nur `auditory`, und
 * `audible` findet sich weder in seinen Listen noch in den 53 mitgelieferten
 * Gefahren noch in einer Migration. Der Autor hat es als Satzfehler
 * des Hefts bestaetigt — ohne diese Bestaetigung stuende es hier nicht,
 * sondern waere weiter gemeldet worden.
 */
const MERKMAL_SONDERFALL: Record<string, string> = {
  audible: 'auditory',
};

/**
 * Die Aktionsplakette des Hefts in die beiden Felder des Systems.
 *
 * `actionTypes` kennt genau vier Werte (`action`, `reaction`, `free`,
 * `passive`), die Anzahl steht getrennt in `actions.value` und ist bei allem
 * ausser `action` leer.
 */
const PLAKETTE: Record<string, { actionType: string; actions: number | null }> = {
  'one-action': { actionType: 'action', actions: 1 },
  'two-actions': { actionType: 'action', actions: 2 },
  'three-actions': { actionType: 'action', actions: 3 },
  reaction: { actionType: 'reaction', actions: null },
  'free-action': { actionType: 'free', actions: null },
};

/**
 * Vor diesen Etiketten faengt ein neuer Absatz an.
 *
 * Es ist dieselbe Liste, an der der Statblock-Leser Fortsetzungen erkennt:
 * Was dort zum Eintrag davor gehoert, ist hier ein eigener Punkt. Ohne den
 * Umbruch steht die ganze Routine einer Gefahr als eine Wand aus Text im
 * Blatt, mit vier Erfolgsgraden mittendrin (am 14.08.2026 an `Ghostly Ushers`
 * in der Instanz gesehen).
 */
const ABSATZ_VOR = new RegExp(
  `(?=\\*\\*(?:${[...FORTSETZUNG]
    .map((wort) => wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\*\\*)`,
  'i',
);

/**
 * Absatz-HTML aus dem Markdown-Zwischenstand des Lesers.
 *
 * Je Unterpunkt ein `<p>` — so setzt das PF2e-System seine eigenen Gefahren
 * auch, und nur so bleibt im Blatt erkennbar, wo der Auslöser aufhört und die
 * Wirkung anfaengt.
 */
function html(text: string | undefined): string {
  const sauber = (text ?? '').trim();
  if (sauber === '') return '';
  return sauber
    .split(ABSATZ_VOR)
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '')
    .map((teil) => `<p>${inlineHtml(teil)}</p>`)
    .join('\n');
}

/**
 * Der Heimlichkeitswert, wie das System ihn speichert: als **Modifikator**.
 *
 * Das Heft druckt zwei Formen. Eine einfache Gefahr bekommt einen
 * Schwierigkeitsgrad (`Stealth DC 21`), eine komplexe einen Modifikator
 * (`Stealth +16`), weil sie damit Initiative wuerfelt. Im Actor steht immer
 * der Modifikator; den Grad rechnet das System als `10 + Wert` aus
 * (`hazard/document.ts`, `getTraceData`). Aus `DC 21` wird also 11.
 */
export function leseStealth(text: string | undefined): { wert: number | null; zusatz: string } {
  const roh = (text ?? '').trim();
  if (roh === '') return { wert: null, zusatz: '' };

  const treffer = /^(DC\s*)?([+–—-]?\s*\d+)\s*/i.exec(roh.replace(/[–—]/g, '-'));
  if (!treffer) return { wert: null, zusatz: roh };

  const zahl = Number(treffer[2]!.replace(/\s+/g, ''));
  if (!Number.isFinite(zahl)) return { wert: null, zusatz: roh };

  return {
    wert: treffer[1] ? zahl - 10 : zahl,
    zusatz: roh.slice(treffer[0].length).trim(),
  };
}

/**
 * `axes 5`, `fire 3`, `vitality 5` → Schluessel und Staerke.
 *
 * Immunitaeten haben keine Staerke (`critical hits`), Schwaechen und
 * Resistenzen schon. Der Schluessel entsteht aus dem Wortlaut: klein,
 * Leerzeichen zu Bindestrichen.
 */
export function leseIwr(eintrag: string): { typ: string; wert?: number } {
  const treffer = /^(.*?)\s+(\d+)\s*$/.exec(eintrag.trim());
  const schluessel = normalisiere(treffer ? treffer[1]! : eintrag);
  return {
    typ: IWR_SONDERFALL[schluessel] ?? schluessel,
    ...(treffer ? { wert: Number(treffer[2]) } : {}),
  };
}

/**
 * Prueft Merkmale gegen eine Liste des Systems und meldet, was fehlt.
 *
 * Anlass war `Shh!` aus 8-03: Das Heft druckt `(audible, curse)`, das System
 * kennt aber nur `auditory` — `audible` steht in keiner seiner Listen und in
 * keiner der mitgelieferten Dateien. Geschrieben wurde es trotzdem, und
 * Foundry warf beim Anlegen eine Validierungsmeldung in die Konsole.
 *
 * Was im Heft nachweislich anders heisst, steht in `MERKMAL_SONDERFALL`; alles
 * andere wird gemeldet statt geraten.
 */
function gepruefteMerkmale(
  merkmale: readonly string[],
  erlaubt: ReadonlySet<string> | undefined,
  woher: string,
  ungenutzt: string[],
): string[] {
  return merkmale
    .map((merkmal) => {
      const schluessel = normalisiere(merkmal);
      return MERKMAL_SONDERFALL[schluessel] ?? schluessel;
    })
    .filter((merkmal) => {
      if (!erlaubt || erlaubt.has(merkmal)) return true;
      ungenutzt.push(`${woher}: ${merkmal}`);
      return false;
    });
}

/** Ein Angriff als eingebettetes `melee`-Item. */
function angriffsItem(
  angriff: Angriff,
  samen: string,
  werke: Schluesselwerke,
  ungenutzt: string[],
): Record<string, unknown> {
  // Der Schluessel des Schadenswurfs ist frei waehlbar, muss aber existieren.
  // Abgeleitet statt gewuerfelt, damit zwei Laeufe dieselben Daten ergeben.
  const wurfId = foundryId(`${samen}/schaden/${angriff.name}`);

  // Die Reichweite steht im Heft unter den Merkmalen (`range increment 20
  // feet`), im System aber in einem eigenen Feld. `range-increment-20` ist
  // **kein** Merkmalsschluessel — als solcher geschrieben wies Foundry ihn ab.
  // (Der Vorlagenabgleich uebersetzt in die andere Richtung; dort wird aus dem
  // Feld ein Merkmal, damit sich Heft und Kompendium vergleichen lassen.)
  let reichweite: number | undefined;
  const merkmaleOhneReichweite = angriff.merkmale.filter((merkmal) => {
    const treffer = /^range\s+increment\s+(\d+)/i.exec(merkmal.trim());
    if (!treffer) return true;
    reichweite = Number(treffer[1]);
    return false;
  });

  return {
    name: angriff.name,
    type: 'melee',
    system: {
      bonus: { value: angriff.mod },
      damageRolls: angriff.formel
        ? {
            [wurfId]: {
              damage: angriff.formel,
              damageType: angriff.schadensart ?? 'untyped',
            },
          }
        : {},
      // Das Heft schreibt `range increment 20 feet` und `deadly 1d6`, das
      // System `range-increment-20` und `deadly-d6` — dieselbe Umschrift, die
      // schon der Vorlagenabgleich braucht.
      traits: {
        value: gepruefteMerkmale(
          merkmaleOhneReichweite,
          werke.angriffsMerkmale,
          `Angriffsmerkmal ${angriff.name}`,
          ungenutzt,
        ),
      },
      range: reichweite === undefined ? null : { increment: reichweite, max: null },
      attackEffects: { value: [] },
      // Der volle Wortlaut der Schadenszeile bleibt als Beschreibung stehen:
      // Zusaetze wie `plus 1d4 persistent bleed` passen in kein Feld, waeren
      // aber am Tisch das Entscheidende.
      description: { value: html(angriff.schaden) },
    },
  };
}

/** Eine benannte Faehigkeit als eingebettetes `action`-Item. */
function faehigkeitsItem(
  faehigkeit: Faehigkeit,
  werke: Schluesselwerke,
  ungenutzt: string[],
): Record<string, unknown> {
  const art = faehigkeit.plakette
    ? PLAKETTE[faehigkeit.plakette.toLowerCase()]
    : { actionType: 'passive', actions: null };

  return {
    name: faehigkeit.name,
    type: 'action',
    system: {
      actionType: { value: art?.actionType ?? 'passive' },
      actions: { value: art?.actions ?? null },
      category: null,
      description: { value: html(faehigkeit.text) },
      traits: {
        rarity: 'common',
        value: gepruefteMerkmale(
          faehigkeit.merkmale,
          werke.aktionsMerkmale,
          `Merkmal ${faehigkeit.name}`,
          ungenutzt,
        ),
      },
    },
  };
}

/**
 * Baut die Actordaten einer Gefahr.
 *
 * Gebaut wird nur, was das Heft wirklich hergibt. Was nicht untergebracht
 * werden konnte, steht in `ungenutzt` — es zu erfinden waere schlimmer als
 * es zu melden.
 *
 * `quelle` ist die Angabe des Hefts (`naming.ts::quellenangabe`); fehlt sie,
 * bleibt das Feld leer.
 */
export function baueGefahr(
  statblock: Statblock,
  werke: Schluesselwerke = {},
  quelle?: string,
): GebauteGefahr {
  const ungenutzt: string[] = [];

  /** Prueft einen Schluessel gegen das System, statt ihn blind zu schreiben. */
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
  const seltenheit = plakette.find((m) => SELTENHEITEN.has(m)) ?? 'common';
  const merkmale = geprueft(
    plakette.filter((m) => !KEINE_MERKMALE.has(m) && !SELTENHEITEN.has(m)),
    werke.merkmale,
    'Merkmal',
  );

  const stealth = leseStealth(statblock.stealth);

  const immunitaeten = geprueft(
    statblock.immunitaeten.map((e) => leseIwr(e).typ),
    werke.immunitaeten,
    'Immunitaet',
  ).map((typ) => ({ type: typ }));

  const alsIwr = (
    eintraege: readonly string[],
    erlaubt: ReadonlySet<string> | undefined,
    was: string,
  ): Array<{ type: string; value: number }> => {
    const ergebnis: Array<{ type: string; value: number }> = [];
    for (const eintrag of eintraege) {
      const { typ, wert } = leseIwr(eintrag);
      // Eine Schwaeche ohne Zahl kann das System nicht speichern — der Wert
      // ist Pflicht und mindestens 1.
      if (wert === undefined || wert < 1) {
        ungenutzt.push(`${was}: ${eintrag}`);
        continue;
      }
      if (erlaubt && !erlaubt.has(typ)) {
        ungenutzt.push(`${was}: ${eintrag}`);
        continue;
      }
      ergebnis.push({ type: typ, value: wert });
    }
    return ergebnis;
  };

  const samen = `${statblock.name}/${statblock.stufe}`;
  const rettung = (wert: number | undefined): { value: number | null; saveDetail: string } => ({
    value: wert ?? null,
    saveDetail: '',
  });

  // Was der Statblock einer Kreatur fuehrt, eine Gefahr aber nicht hat, faellt
  // hier auf. Gemeldet statt verschwiegen — es waere ein Hinweis darauf, dass
  // die Kopfzeile falsch gelesen wurde.
  if (statblock.perception !== undefined) ungenutzt.push('Wahrnehmung');
  if (statblock.sprachen.length > 0) ungenutzt.push('Sprachen');
  if (statblock.fertigkeiten.length > 0) ungenutzt.push('Fertigkeiten');
  if (Object.keys(statblock.attribute).length > 0) ungenutzt.push('Attribute');
  if (statblock.gegenstaende.length > 0) ungenutzt.push('Gegenstaende');
  for (const abschnitt of statblock.rest) ungenutzt.push(`Etikett: ${abschnitt.etikett}`);

  const daten: Record<string, unknown> = {
    name: statblock.name,
    type: 'hazard',
    system: {
      attributes: {
        ac: { value: statblock.ac ?? 0 },
        hardness: statblock.haerte ?? 0,
        hp: {
          max: statblock.tp ?? 0,
          value: statblock.tp ?? 0,
          temp: 0,
          details: statblock.tpZusatz ?? '',
        },
        immunities: immunitaeten,
        weaknesses: alsIwr(statblock.schwaechen, werke.schwaechen, 'Schwaeche'),
        resistances: alsIwr(statblock.resistenzen, werke.resistenzen, 'Resistenz'),
        stealth: { value: stealth.wert, details: html(stealth.zusatz) },
        emitsSound: 'encounter',
      },
      details: {
        description: html(statblock.beschreibung),
        disable: html(statblock.entschaerfen),
        routine: html(statblock.routine),
        reset: html(statblock.ruecksetzung),
        // `complex` steht in der Merkmalsplakette, im System aber hier.
        isComplex: plakette.includes('complex'),
        level: { value: statblock.stufe },
        // Wie die Gefahren des Season-7-Moduls: das Heft als Quelle, unter
        // der ORC-Lizenz als Remaster-Produkt.
        publication: { title: quelle ?? '', authors: '', license: 'ORC', remaster: true },
      },
      saves: {
        fortitude: rettung(statblock.rettungswuerfe.fort),
        reflex: rettung(statblock.rettungswuerfe.ref),
        will: rettung(statblock.rettungswuerfe.will),
      },
      traits: { rarity: seltenheit, size: { value: 'med' }, value: merkmale },
    },
    items: [
      ...statblock.angriffe.map((angriff) => angriffsItem(angriff, samen, werke, ungenutzt)),
      ...statblock.faehigkeiten.map((f) => faehigkeitsItem(f, werke, ungenutzt)),
    ],
  };

  return { daten, ungenutzt };
}
