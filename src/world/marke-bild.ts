/**
 * Zeichnet das Bild eines Raummarkers: farbiges Feld mit Rahmen, die Kennung
 * in der Mitte.
 *
 * Bis Fassung 1.5.0 war das ein SVG. Auf dem Server des Autors (Foundry v14,
 * Build 369) kam aus `A1.svg` beim Hochladen `a1.webp` heraus, und die
 * Notizen fanden ihr Bild nicht. WebP ist das Format, das ein solcher Server
 * ohnehin haben will; es geht unveraendert durch.
 *
 * Gezeichnet wird auf einer `OffscreenCanvas` — nur im Browser, deshalb eine
 * eigene Datei neben `webp.ts` und unter Vitest nicht geladen. Kann der
 * Browser kein WebP schreiben (Firefox), kommt PNG heraus; die Endung folgt
 * dem tatsaechlichen `blob.type`.
 */
import { markeFarben, markeSchriftAnteil } from './raummarken.ts';
import { WEBP_QUALITY } from './webp.ts';

/** Kantenlaenge in Bildpunkten — scharf genug fuer zwei Felder Groesse. */
const KANTE = 200;

export async function zeichneMarke(
  kennung: string,
  farben: { grund?: string; schrift?: string } = {},
): Promise<{ blob: Blob; endung: string }> {
  const { grund, schrift } = markeFarben(farben);
  const canvas = new OffscreenCanvas(KANTE, KANTE);
  const zeichnung = canvas.getContext('2d');
  if (!zeichnung) throw new Error('Keine 2D-Zeichenflaeche verfuegbar');

  // Feld und Rahmen: wie das fruehere SVG, auf 200 statt 100 Punkte.
  const rand = 6;
  const strich = 12;
  zeichnung.beginPath();
  zeichnung.roundRect(rand, rand, KANTE - 2 * rand, KANTE - 2 * rand, 28);
  zeichnung.fillStyle = grund;
  zeichnung.fill();
  zeichnung.lineWidth = strich;
  zeichnung.strokeStyle = schrift;
  zeichnung.stroke();

  zeichnung.fillStyle = schrift;
  zeichnung.font = `bold ${Math.round(KANTE * markeSchriftAnteil(kennung))}px Arial, Helvetica, sans-serif`;
  zeichnung.textAlign = 'center';
  zeichnung.textBaseline = 'middle';
  zeichnung.fillText(kennung, KANTE / 2, KANTE / 2 + 4);

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  return { blob, endung: blob.type === 'image/webp' ? 'webp' : 'png' };
}
