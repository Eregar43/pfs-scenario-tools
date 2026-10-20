import type { Raummarke } from '../pdf/raummarken.ts';
import type { Kartendaten } from './karten.ts';

/**
 * Raumkennungen als Notizen auf der Szene.
 *
 * Jede Kennung, die das Heft auf die Karte druckt (`A1` … `A7` in 8-06),
 * wird eine Notiz an derselben Stelle. Sie zeigt auf die Journalseite des
 * Raums (`A1. Lift Platform`) und traegt ein eigenes Bild mit der Kennung.
 *
 * Das Bild entsteht hier als SVG, nicht als mitgelieferte Datei: Die
 * Kennungen sind je Heft andere (`B7`, `A3a`), und ein Bildpfad gehoert
 * ohnehin der Welt, nicht dem Modul — der Kartenexport laesst fremde
 * Bildpfade weg.
 *
 * Foundry zeichnet ein Notizbild immer **quadratisch** (`ControlIcon`:
 * `icon.width = icon.height = size`). Ein breites Bild mit der ganzen
 * Ueberschrift wuerde gestaucht; die Ueberschrift steht deshalb im
 * Notiztext, das Bild traegt die Kennung.
 *
 * Reine Logik — Hochladen und Schreiben machen `ui/welt-dialog.ts` und
 * `apply.ts`.
 */

/** Wo eine Raumkennung im Kartenbild steht und welches Bild sie bekommt. */
export interface MarkeMitBild extends Raummarke {
  /** Pfad des hochgeladenen SVG. */
  pfad: string;
}

/** Eine Journalseite, wie der Plan sie kennt. */
export interface SeiteKurz {
  id: string;
  name: string;
}

/** Foundrys Vorgabe, wenn die Kartendatei keine Gittergroesse nennt. */
const GITTER_VORGABE = 100;

/** Kleiner laesst Foundry ein Notizbild nicht zu (`iconSize`, min 32). */
const KLEINSTES_BILD = 32;

/**
 * Wohin das Markerbild einer Kennung kommt: neben die Karte, in einen
 * Unterordner `marker/`. Abgeleitet vom Pfad der Karte, damit Hochladen und
 * Notiz denselben Pfad bilden, ohne die Bildwurzel zu kennen.
 */
export function markePfad(kartenPfad: string, kennung: string): string {
  return `${kartenPfad.slice(0, kartenPfad.lastIndexOf('/'))}/marker/${kennung}.svg`;
}

/**
 * Das Markerbild: weisses Feld, schwarze Kennung.
 *
 * Die Schriftgroesse schrumpft mit der Laenge, damit `A12` und `A3a`
 * genauso ins Feld passen wie `A1`.
 */
export function markeSvg(kennung: string): string {
  const groesse = kennung.length <= 2 ? 56 : kennung.length === 3 ? 44 : 34;
  const text = kennung.replace(/[<>&"]/g, '');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">',
    '<rect x="3" y="3" width="94" height="94" rx="14" fill="#ffffff" stroke="#000000" stroke-width="6"/>',
    `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${groesse}" fill="#000000">${text}</text>`,
    '</svg>',
  ].join('');
}

/**
 * Die Journalseite eines Raums: ihr Name beginnt mit der Kennung und einem
 * Punkt (`A1. Lift Platform`). Groß und klein zaehlt — `A3a` ist nicht `A3A`.
 */
export function seiteZurKennung(
  kennung: string,
  seiten: readonly SeiteKurz[],
): SeiteKurz | undefined {
  return seiten.find((seite) => {
    const name = seite.name.trim();
    return name.startsWith(kennung) && /^[.:]?\s/.test(name.slice(kennung.length));
  });
}

/**
 * Die Notizen einer Karte, in Dateiform (`journal` statt `entryId`, wie
 * `kartenabgleich.ts::notizInDatei`). So laufen sie denselben Weg wie
 * Notizen aus einer Kartendatei.
 *
 * Die Lage rechnet Foundrys `Scene#getDimensions` nach: Das Bild beginnt bei
 * Rand minus Versatz (`sceneX = dimensions.x - shiftX`) und ist um die
 * Skalierung vergroessert. Den Rand setzt der Import auf 0, solange die
 * Kartendatei nichts anderes sagt.
 */
export function notizenAusMarken(
  marken: readonly MarkeMitBild[],
  seiten: readonly SeiteKurz[],
  karte: Kartendaten | undefined,
  leinwand: { width: number; height: number },
): Record<string, unknown>[] {
  const szene = karte?.szene ?? {};
  const gitter = Number((szene.grid as { size?: unknown } | undefined)?.size ?? GITTER_VORGABE);
  const rand = Number(szene.padding ?? 0);
  const randX = Math.ceil((rand * leinwand.width) * (1 / gitter)) * gitter;
  const randY = Math.ceil((rand * leinwand.height) * (1 / gitter)) * gitter;
  const nachX = randX - Number(szene.shiftX ?? 0);
  const nachY = randY - Number(szene.shiftY ?? 0);
  const faktor = karte?.skalierung ?? 1;

  return marken.map((marke) => {
    const seite = seiteZurKennung(marke.kennung, seiten);
    return {
      x: Math.round(nachX + marke.x * faktor),
      y: Math.round(nachY + marke.y * faktor),
      texture: { src: marke.pfad },
      iconSize: Math.max(KLEINSTES_BILD, Math.round(gitter)),
      text: seite?.name ?? marke.kennung,
      ...(seite ? { journal: 'journal', pageId: seite.id } : {}),
    };
  });
}
