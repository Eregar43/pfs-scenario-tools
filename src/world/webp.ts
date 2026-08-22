/**
 * Schreibt rohe Pixel als WebP — der Browser-Ersatz fuer `sharp`.
 *
 * WebP ist in FoundryVTT das empfohlene Format: es traegt den Alphakanal und
 * ist bei gleicher Anmutung ein Bruchteil so gross wie PNG. Kodiert wird ueber
 * eine `OffscreenCanvas`; die gibt es nur im Browser, weshalb diese Datei in
 * der Foundry-Schicht liegt und nicht in `src/pdf/` — unter Vitest laeuft sie
 * nicht.
 *
 * Kann der Browser kein WebP schreiben (Firefox), liefert `convertToBlob`
 * laut Spezifikation stillschweigend PNG. Deshalb kommt die Dateiendung aus
 * dem tatsaechlichen `blob.type`, nicht aus dem Wunsch.
 */
import { CHANNELS, GRAYSCALE, RGBA } from '../pdf/images.ts';
import type { ExtractedImage } from '../pdf/images.ts';

/**
 * Guetestufe der WebP-Dateien. Entspricht der 90 des Extractors — die
 * Canvas-Schnittstelle zaehlt von 0 bis 1 statt bis 100.
 */
export const WEBP_QUALITY = 0.9;

export interface KodiertesBildDatei {
  blob: Blob;
  /** `webp`, oder `png`, wenn der Browser kein WebP schreiben kann. */
  endung: string;
}

/**
 * Bringt die Pixel auf die vier Kanaele, die `ImageData` verlangt.
 *
 * Graustufen und RGB bekommen volle Deckung dazu; ueberzaehlige Bytes am Ende
 * des Puffers (pdfjs rundet mitunter auf) bleiben aussen vor.
 */
function alsRgba(
  width: number,
  height: number,
  kind: number,
  data: Uint8Array,
): Uint8ClampedArray<ArrayBuffer> {
  const channels = CHANNELS[kind];
  if (channels === undefined) throw new Error(`Unbekannte Bildart ${kind}`);
  if (data.length < width * height * channels) {
    throw new Error(`Zu wenige Bilddaten: ${data.length} statt ${width * height * channels}`);
  }

  const points = width * height;
  const rgba = new Uint8ClampedArray(points * 4);

  for (let i = 0; i < points; i++) {
    const at = i * channels;
    if (kind === GRAYSCALE) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = data[at]!;
      rgba[i * 4 + 3] = 255;
    } else {
      rgba[i * 4] = data[at]!;
      rgba[i * 4 + 1] = data[at + 1]!;
      rgba[i * 4 + 2] = data[at + 2]!;
      rgba[i * 4 + 3] = kind === RGBA ? data[at + 3]! : 255;
    }
  }

  return rgba;
}

/**
 * Kodiert ein extrahiertes Bild.
 *
 * Bekannte Grenze: die Canvas rechnet intern mit vormultipliziertem Alpha.
 * An den weichen Raendern freigestellter Figuren kostet der Weg hinein und
 * wieder heraus etwas Farbgenauigkeit — bei Deckung 255 und 0, also fast
 * ueberall, aendert sich nichts.
 */
export async function kodiereBild(image: ExtractedImage): Promise<KodiertesBildDatei> {
  const rgba = alsRgba(image.width, image.height, image.kind, image.data);

  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Keine 2D-Zeichenflaeche verfuegbar');

  context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });

  return { blob, endung: blob.type === 'image/webp' ? 'webp' : 'png' };
}
