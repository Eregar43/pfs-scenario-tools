import type { Kartenstrich, Kartentext } from '../pdf/raummarken.ts';
import type { Kartendaten } from './karten.ts';
import { bildZuSzene } from './raummarken.ts';

/**
 * Was das Heft ueber die Karte zeichnet, als Zeichnungen fuer den
 * Spielleiter: Linien (in 8-06 rote Trennlinien und die gestrichelte Flaeche
 * der Falle) und Beschriftungen (`TRAP`, `PCS START HERE`).
 *
 * Alle Zeichnungen sind **verborgen** (`hidden: true`) — Foundry zeigt sie
 * nur dem Spielleiter. Sie verraten Fallen und Startpunkte, die die Spieler
 * nicht sehen sollen.
 *
 * Ausgabe in Dateiform, wie `Kartendaten.zeichnungen`. Foundry v14 kennt an
 * einer Zeichnung keine Strichelung (Schema in `foundry.mjs` nachgelesen);
 * eine gestrichelte Linie wird durchgezogen, aber halb durchsichtig.
 *
 * Reine Logik, kein Foundry-Zugriff.
 */

/** Wie weit Linien auseinander liegen duerfen, um noch einen Rahmen zu bilden. */
const NAEHE = 6;

/** Halbe Deckkraft fuer gestrichelte Linien — die Strichelung kennt Foundry nicht. */
const GESTRICHELT_ALPHA = 0.6;

interface Kasten {
  links: number;
  oben: number;
  rechts: number;
  unten: number;
}

function kastenVon(punkte: ReadonlyArray<{ x: number; y: number }>): Kasten {
  return {
    links: Math.min(...punkte.map((punkt) => punkt.x)),
    oben: Math.min(...punkte.map((punkt) => punkt.y)),
    rechts: Math.max(...punkte.map((punkt) => punkt.x)),
    unten: Math.max(...punkte.map((punkt) => punkt.y)),
  };
}

function beruehren(a: Kasten, b: Kasten, abstand: number): boolean {
  return (
    a.links - abstand <= b.rechts &&
    b.links - abstand <= a.rechts &&
    a.oben - abstand <= b.unten &&
    b.oben - abstand <= a.unten
  );
}

/** Liegt jeder Punkt auf dem Rand des Kastens? Dann ist es ein Rahmen. */
function liegtAufRand(punkte: ReadonlyArray<{ x: number; y: number }>, kasten: Kasten): boolean {
  return punkte.every(
    (punkt) =>
      Math.abs(punkt.x - kasten.links) <= NAEHE ||
      Math.abs(punkt.x - kasten.rechts) <= NAEHE ||
      Math.abs(punkt.y - kasten.oben) <= NAEHE ||
      Math.abs(punkt.y - kasten.unten) <= NAEHE,
  );
}

/** Eine Form: entweder ein Rahmen oder ein einzelner Linienzug. */
interface Form {
  kasten: Kasten;
  rahmen: boolean;
  striche: Kartenstrich[];
  text?: Kartentext;
}

/**
 * Fasst Linien gleicher Farbe zusammen, die sich zu einem Rahmen fuegen.
 *
 * Der Rahmen der Falle in 8-06 sind acht Linien: vier gestrichelte Kanten
 * und vier durchgezogene Ecken. Einzeln als Zeichnung waere das ein Haufen
 * Striche, den niemand anfassen will; zusammen ist es ein Rechteck. Was sich
 * nicht zu einem Rahmen fuegt (die roten Trennlinien), bleibt einzeln.
 */
export function formenAusStrichen(striche: readonly Kartenstrich[]): Form[] {
  const gruppen: Kartenstrich[][] = [];
  for (const strich of striche) {
    const kasten = kastenVon(strich.punkte);
    const passend = gruppen.filter(
      (gruppe) =>
        gruppe[0]!.farbe === strich.farbe &&
        // Strichelung und Ecken lassen Luecken von etwa zwei Strichstaerken
        // (8 Bildpunkte in 8-06); der Spielraum waechst deshalb mit.
        beruehren(kastenVon(gruppe.flatMap((s) => s.punkte)), kasten, NAEHE + 2 * strich.breite),
    );
    const vereint = [...passend.flat(), strich];
    for (const gruppe of passend) gruppen.splice(gruppen.indexOf(gruppe), 1);
    gruppen.push(vereint);
  }

  return gruppen.flatMap((gruppe): Form[] => {
    const punkte = gruppe.flatMap((strich) => strich.punkte);
    const kasten = kastenVon(punkte);
    const flaechig = kasten.rechts - kasten.links > NAEHE && kasten.unten - kasten.oben > NAEHE;
    const rahmen =
      flaechig && (gruppe.length >= 3 || gruppe.some((s) => s.geschlossen)) && liegtAufRand(punkte, kasten);
    if (rahmen) return [{ kasten, rahmen: true, striche: gruppe }];
    return gruppe.map((strich) => ({ kasten: kastenVon(strich.punkte), rahmen: false, striche: [strich] }));
  });
}

/** Schriftgrad in Foundrys Grenzen (8 bis 256). */
function schriftgrad(wert: number): number {
  return Math.max(8, Math.min(256, Math.round(wert)));
}

/**
 * Die Zeichnungen einer Karte, in Dateiform.
 *
 * Eine Beschriftung, die in einem Rahmen steht, wird dessen Text (`TRAP` in
 * seinem Rechteck); jede andere wird eine Zeichnung ohne Linie, nur mit Text.
 */
export function zeichnungenAusKarte(
  texte: readonly Kartentext[],
  striche: readonly Kartenstrich[],
  karte: Kartendaten | undefined,
  leinwand: { width: number; height: number },
): Record<string, unknown>[] {
  const { faktor, punkt } = bildZuSzene(karte, leinwand);
  const formen = formenAusStrichen(striche);

  const freieTexte: Kartentext[] = [];
  for (const text of texte) {
    const rahmen = formen.find(
      (form) =>
        form.rahmen &&
        !form.text &&
        text.x >= form.kasten.links &&
        text.x <= form.kasten.rechts &&
        text.y >= form.kasten.oben &&
        text.y <= form.kasten.unten,
    );
    if (rahmen) rahmen.text = text;
    else freieTexte.push(text);
  }

  const gemeinsam = { hidden: true, fillType: 0, bezierFactor: 0, rotation: 0 };

  const ausFormen = formen.map((form) => {
    const strich = form.striche[0]!;
    const gestrichelt = form.striche.some((s) => s.gestrichelt);
    const links = punkt(form.kasten.links, form.kasten.oben);
    const rechts = punkt(form.kasten.rechts, form.kasten.unten);
    const linie = {
      strokeColor: strich.farbe,
      strokeWidth: Math.max(1, Math.round(Math.max(...form.striche.map((s) => s.breite)) * faktor)),
      strokeAlpha: gestrichelt ? GESTRICHELT_ALPHA : 1,
    };
    const text = form.text
      ? { text: form.text.text, fontSize: schriftgrad(form.text.groesse * faktor), textColor: '#ffffff' }
      : {};

    if (form.rahmen) {
      return {
        ...gemeinsam,
        x: links.x,
        y: links.y,
        shape: { type: 'r', width: rechts.x - links.x, height: rechts.y - links.y },
        ...linie,
        ...text,
      };
    }
    const szenenPunkte = strich.punkte.map((p) => punkt(p.x, p.y));
    if (strich.geschlossen) szenenPunkte.push(szenenPunkte[0]!);
    return {
      ...gemeinsam,
      x: links.x,
      y: links.y,
      shape: {
        type: 'p',
        width: rechts.x - links.x,
        height: rechts.y - links.y,
        points: szenenPunkte.flatMap((p) => [p.x - links.x, p.y - links.y]),
      },
      ...linie,
    };
  });

  const ausTexten = freieTexte.map((text) => {
    const grad = schriftgrad(text.groesse * faktor);
    // Breite grob geschaetzt: Versalien sind etwa 0,65 Geviert breit.
    const breite = Math.round(text.text.length * grad * 0.65 + grad);
    const hoehe = Math.round(grad * 1.6);
    const mitte = punkt(text.x, text.y);
    return {
      ...gemeinsam,
      x: mitte.x - Math.round(breite / 2),
      y: mitte.y - Math.round(hoehe / 2),
      shape: { type: 'r', width: breite, height: hoehe },
      strokeWidth: 0,
      text: text.text,
      fontSize: grad,
      textColor: '#ffffff',
    };
  });

  return [...ausFormen, ...ausTexten];
}
