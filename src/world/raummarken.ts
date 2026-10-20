import { alsKennung, type Raummarke } from '../pdf/raummarken.ts';
import type { Kartendaten } from './karten.ts';

/**
 * Raumkennungen als Notizen auf der Szene.
 *
 * Jede Kennung, die das Heft auf die Karte druckt (`A1` … `A7` in 8-06),
 * wird eine Notiz an derselben Stelle. Sie zeigt auf die Journalseite des
 * Raums (`A1.` und der Name des Raums) und traegt ein eigenes Bild mit der Kennung.
 *
 * Das Bild entsteht beim Import als WebP (`marke-bild.ts`), nicht als
 * mitgelieferte Datei: Die
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
 * Unterordner `marker/`, kleingeschrieben (`a3a.webp`). Abgeleitet vom Pfad
 * der Karte, damit Hochladen und Notiz denselben Pfad bilden, ohne die
 * Bildwurzel zu kennen.
 *
 * Das ist der **erwartete** Ort. Wohin der Server die Datei wirklich legt,
 * sagt erst die Antwort beim Hochladen; `apply.ts` nimmt dann jene.
 */
export function markePfad(kartenPfad: string, kennung: string, endung = 'webp'): string {
  return `${kartenPfad.slice(0, kartenPfad.lastIndexOf('/'))}/marker/${kennung.toLowerCase()}.${endung}`;
}

/** Vorgaben fuer die Farben: weisses Feld, schwarze Schrift. */
export const MARKE_GRUND = '#ffffff';
export const MARKE_SCHRIFT = '#000000';

/**
 * Schriftgrad der Kennung im Markerbild, als Anteil der Kantenlaenge. Er
 * schrumpft mit der Laenge, damit `A12` und `A3a` genauso ins Feld passen
 * wie `A1`.
 */
export function markeSchriftAnteil(kennung: string): number {
  return kennung.length <= 2 ? 0.56 : kennung.length === 3 ? 0.44 : 0.34;
}

/** Die Farben eines Markers, auf `#rrggbb` geprueft. */
export function markeFarben(farben: { grund?: string; schrift?: string } = {}): {
  grund: string;
  schrift: string;
} {
  return { grund: farbe(farben.grund, MARKE_GRUND), schrift: farbe(farben.schrift, MARKE_SCHRIFT) };
}

/** Nur `#rrggbb` gilt; alles andere faellt auf die Vorgabe. */
function farbe(wert: string | undefined, vorgabe: string): string {
  return wert && /^#[0-9a-f]{6}$/i.test(wert) ? wert : vorgabe;
}

/**
 * Die Journalseite eines Raums: ihr Name beginnt mit der Kennung und einem
 * Punkt (`A1.` und der Name des Raums).
 */
export function seiteZurKennung(
  kennung: string,
  seiten: readonly SeiteKurz[],
): SeiteKurz | undefined {
  const genau = seiten.find((seite) => {
    const name = seite.name.trim();
    return name.startsWith(kennung) && /^[.:]?\s/.test(name.slice(kennung.length));
  });
  if (genau) return genau;
  // Ein Teilraum ohne eigene Seite gehoert zum Raum davor: `A3a` in 8-08
  // steht auf der Karte, im Text nur unter `A3`.
  const raum = /^([A-Z]\d+)[a-z]$/.exec(kennung)?.[1];
  return raum ? seiteZurKennung(raum, seiten) : undefined;
}

/**
 * Bildpunkt der Karte → Punkt auf der Szene.
 *
 * Rechnet Foundrys `Scene#getDimensions` nach: Das Bild beginnt bei Rand
 * minus Versatz (`sceneX = dimensions.x - shiftX`) und ist um die Skalierung
 * vergroessert. Den Rand setzt der Import auf 0, solange die Kartendatei
 * nichts anderes sagt.
 */
export function bildZuSzene(
  karte: Kartendaten | undefined,
  leinwand: { width: number; height: number },
): { faktor: number; gitter: number; punkt: (x: number, y: number) => { x: number; y: number } } {
  const szene = karte?.szene ?? {};
  const gitter = Number((szene.grid as { size?: unknown } | undefined)?.size ?? GITTER_VORGABE);
  const rand = Number(szene.padding ?? 0);
  const randX = Math.ceil((rand * leinwand.width) * (1 / gitter)) * gitter;
  const randY = Math.ceil((rand * leinwand.height) * (1 / gitter)) * gitter;
  const nachX = randX - Number(szene.shiftX ?? 0);
  const nachY = randY - Number(szene.shiftY ?? 0);
  const faktor = karte?.skalierung ?? 1;
  return {
    faktor,
    gitter,
    punkt: (x, y) => ({ x: Math.round(nachX + x * faktor), y: Math.round(nachY + y * faktor) }),
  };
}

/**
 * Die Notizen einer Karte, in Dateiform: `journal` statt `entryId` und
 * `marke` statt eines Bildpfads (wie `kartenabgleich.ts::notizInDatei`). So
 * laufen sie denselben Weg wie Notizen aus einer Kartendatei; den Bildpfad
 * setzt erst `notizAusDatei` beim Schreiben.
 */
export function notizenAusMarken(
  marken: readonly Raummarke[],
  seiten: readonly SeiteKurz[],
  karte: Kartendaten | undefined,
  leinwand: { width: number; height: number },
  /** Kantenlaenge des Markers in Feldern; 1 ist ein Feld. */
  groesse = 1,
): Record<string, unknown>[] {
  const { gitter, punkt } = bildZuSzene(karte, leinwand);
  return marken.map((marke) => {
    const seite = seiteZurKennung(marke.kennung, seiten);
    return {
      ...punkt(marke.x, marke.y),
      marke: marke.kennung,
      iconSize: Math.max(KLEINSTES_BILD, Math.round(gitter * groesse)),
      text: seite?.name ?? marke.kennung,
      ...(seite ? { journal: 'journal', pageId: seite.id } : {}),
    };
  });
}

/**
 * Die Kennung eines Markerbilds aus seinem Pfad — die Umkehrung von
 * `markePfad`. Ein anderer Pfad ist kein Marker.
 */
export function markeAusPfad(pfad: unknown): string | undefined {
  if (typeof pfad !== 'string') return undefined;
  // Nur die heutige Form: klein, WebP oder (Firefox) PNG. Eine Notiz auf
  // `A1.svg` aus Fassung 1.5.0 gilt damit als abweichend und wird beim
  // naechsten Import ersetzt — sonst bliebe sie auf dem Server des Autors
  // fuer immer ohne Bild.
  const treffer = /\/marker\/([a-z]\d+[a-z]?)\.(?:webp|png)$/.exec(pfad)?.[1];
  return treffer ? alsKennung(treffer) : undefined;
}
