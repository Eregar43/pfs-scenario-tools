/**
 * Baut aus den Zusagen des Hefts (`pdf/effekte.ts`) Effekt-Gegenstaende fuer
 * PF2e — und setzt den Verweis darauf in den Journaltext.
 *
 * Das Schema ist abgelesen, nicht erinnert: `packs/pf2e/other-effects/*.json`
 * derselben Systemfassung 8.4.0, die in der Testinstanz laeuft.
 *
 * Zwei Dinge halten die Effekte von den Spielern fern:
 *
 * - `ownership.default` auf `NONE`. In der Gegenstands-Seitenleiste sieht sie
 *   nur der Spielleiter. Das ist zwar ohnehin Foundrys Vorgabe, steht hier
 *   aber ausdruecklich — der Name allein verraet sonst, was noch kommt
 *   („Bonus im Kampf gegen den Kapitaen").
 * - `system.unidentified`. Liegt der Effekt auf einem Charakter, zeigt PF2e
 *   ihn Nichtspielleitern maskiert. Das Feld heisst im Fenster „Unidentified?".
 *
 * Diese Datei **schreibt nichts** und kennt Foundry nicht.
 */
import type { Szenarioeffekt } from '../pdf/effekte.ts';
import { escapeHtml } from '../pdf/journal.ts';
import type { SeitenAbbild } from './plan.ts';

/**
 * Ein Symbol je Zweck, nicht je Szenario — am Bild soll ablesbar sein, was
 * der Effekt tut. Alle Pfade sind aus Foundrys Grundbestand und dort belegt:
 * das PF2e-System verweist selbst darauf.
 */
const SYMBOLE: { domaene: string; symbol: string }[] = [
  { domaene: 'initiative', symbol: 'icons/magic/time/hourglass-tilted-glowing-gold.webp' },
  { domaene: 'perception', symbol: 'icons/magic/perception/eye-ringed-green.webp' },
  { domaene: 'skill-check', symbol: 'icons/skills/trades/academics-book-study-purple.webp' },
  { domaene: 'saving-throw', symbol: 'icons/magic/air/air-pressure-shield-blue.webp' },
];

/** Ohne erkanntes Ziel bleibt es beim Standardsymbol des Systems. */
const SYMBOL_OHNE_ZIEL = 'systems/pf2e/icons/effects/critical-effect.webp';

export function symbolFuer(effekt: Szenarioeffekt): string {
  const treffer = SYMBOLE.find((eintrag) => effekt.domaenen.includes(eintrag.domaene));
  return treffer?.symbol ?? SYMBOL_OHNE_ZIEL;
}

/**
 * Der Name, wie er in der Seitenleiste und auf dem Charakterblatt steht.
 *
 * Kennung vorn, damit die Effekte eines Szenarios beieinanderstehen. Kurz
 * gehalten: Der volle Satz steht in der Beschreibung, und ein langer Name
 * wird auf dem Blatt ohnehin abgeschnitten.
 */
export function effektName(effekt: Szenarioeffekt, schluessel: string): string {
  const wert = `${effekt.wert > 0 ? '+' : ''}${effekt.wert}`;
  const worauf = effekt.domaenen.includes('initiative')
    ? 'initiative'
    : effekt.domaenen.includes('perception')
      ? 'Perception'
      : effekt.domaenen.length > 0
        ? 'checks'
        : kuerze(effekt.worauf, 40);
  const wer = effekt.ziel === 'gegner' ? ' (enemies)' : '';
  return `PFS ${schluessel}: ${wert} ${worauf}${wer}`;
}

function kuerze(text: string, laenge: number): string {
  if (text.length <= laenge) return text;
  const schnitt = text.slice(0, laenge);
  const luecke = schnitt.lastIndexOf(' ');
  return `${(luecke > 0 ? schnitt.slice(0, luecke) : schnitt).trim()}…`;
}

/**
 * Die Wurf-Option, mit der ein Effekt auf **eine Begegnung** eingegrenzt wird.
 *
 * Sie entsteht nur, wenn beides zusammenkommt:
 *
 * 1. Das Heft nennt eine Seite („in the chase on page 7").
 * 2. Der Effekt wirkt auf Proben, die **wir** ins Journal schreiben —
 *    Fertigkeiten und Rettungswuerfe. Nur die tragen `@Check[...|options:…]`.
 *
 * Initiative und Wahrnehmung lassen sich damit **nicht** eingrenzen: Eine
 * Initiative wird nicht aus dem Journal gewuerfelt, und eine Wahrnehmung im
 * Theater steht ohne Seitenangabe da. Dort bleibt der Effekt ungefiltert, und
 * der Spielleiter legt ihn zur richtigen Begegnung auf.
 *
 * Der Name ist bewusst mechanisch: Szenario und Heftseite, nichts Geratenes.
 */
export function effektOption(effekt: Szenarioeffekt, schluessel: string): string | undefined {
  if (effekt.seite === undefined) return undefined;
  if (!effekt.domaenen.includes('skill-check')) return undefined;
  return `pfs-${schluessel}-page-${effekt.seite}`;
}

/**
 * Die Gegenstandsdaten eines Effekts.
 *
 * Ohne erkanntes Ziel entsteht er **ohne Regelbaustein** — nur mit Text. Ein
 * Bonus am falschen Wert faellt erst am Spieltisch auf; ein fehlender steht
 * wenigstens lesbar da und laesst sich von Hand nachtragen.
 */
export function baueEffekt(
  effekt: Szenarioeffekt,
  schluessel: string,
  quelle?: string,
): Record<string, unknown> {
  const option = effektOption(effekt, schluessel);
  return {
    name: effektName(effekt, schluessel),
    type: 'effect',
    img: symbolFuer(effekt),
    // Ohne Sichtrecht taucht der Effekt in der Seitenleiste der Spieler nicht
    // auf. Foundrys Vorgabe ist dieselbe; hier steht sie ausdruecklich.
    ownership: { default: 0 },
    system: {
      description: {
        value: option
          ? `<p>${escapeHtml(effekt.satz)}</p><p><em>Wirkt nur auf die Proben dieser Begegnung.</em></p>`
          : `<p>${escapeHtml(effekt.satz)}</p>`,
      },
      // Das Heft nennt keine Dauer. Der Spielleiter legt den Effekt zur
      // richtigen Begegnung auf und nimmt ihn danach wieder herunter.
      duration: { value: -1, unit: 'unlimited', sustained: false, expiry: null },
      level: { value: 1 },
      // Maskiert den Effekt fuer Nichtspielleiter — der Name verriete sonst,
      // was noch kommt.
      unidentified: true,
      tokenIcon: { show: true },
      start: { value: 0, initiative: null },
      traits: { rarity: 'common', value: [] },
      publication: {
        title: quelle ?? '',
        authors: '',
        license: 'ORC',
        remaster: true,
      },
      rules: effekt.domaenen.map((domaene) => ({
        key: 'FlatModifier',
        selector: domaene,
        type: effekt.art,
        value: effekt.wert,
        slug: `pfs-${schluessel}-${domaene}`,
        // Eingegrenzt auf die Begegnung, wo das moeglich ist: Die Proben
        // jener Heftseite tragen diese Option, alle anderen nicht.
        ...(option ? { predicate: [option] } : {}),
      })),
    },
  };
}

/**
 * Setzt den Verweis auf den Effekt hinter seinen Satz im Journal.
 *
 * Gearbeitet wird am Wortlaut: Der Satz steht im Journaltext so, wie ihn der
 * Block hergibt — die Zusagen stehen im Fliesstext, ohne Auszeichnung
 * dazwischen. Wird er nicht gefunden, bleibt der Effekt trotzdem stehen; er
 * ist dann nur nicht verlinkt, und die Vorschau sagt es.
 *
 * Zurueck kommt die Zahl der gesetzten Verweise.
 */
export function fuegeEffektVerweiseEin(
  seiten: SeitenAbbild[],
  effekte: { satz: string; id: string; name: string }[],
): number {
  let gesetzt = 0;

  for (const effekt of effekte) {
    const gesucht = escapeHtml(effekt.satz);
    for (const seite of seiten) {
      const at = seite.inhalt.indexOf(gesucht);
      if (at === -1) continue;
      const ende = at + gesucht.length;
      seite.inhalt =
        `${seite.inhalt.slice(0, ende)} @UUID[Item.${effekt.id}]{${effekt.name}}` +
        seite.inhalt.slice(ende);
      gesetzt++;
      break;
    }
  }

  return gesetzt;
}
