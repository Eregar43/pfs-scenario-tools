import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MODULE_ID = 'pfs-scenario-tools';

/**
 * pdf.js im Browser einrichten.
 *
 * Alles hier hat denselben Zweck: dass die Schriftnamen **genauso** ankommen
 * wie in Node beim Extractor. Sie sind das tragende Erkennungsmerkmal —
 * `roles.ts` entscheidet ausschliesslich am Namen, ob ein Textlauf eine
 * Ueberschrift, ein Kastentext oder Fliesstext ist. Ein stillschweigend
 * eingesetzter Ersatzfont wuerde die gesamte Gliederung kippen, ohne dass ein
 * einziges Zeichen fehlt.
 */

export type PdfjsParameter = 'standard' | 'systemschriften';

let eingerichtet = false;

/**
 * Setzt den Worker-Pfad. Nur einmal noetig, danach wirkungslos.
 *
 * pdf.js baut aus `workerSrc` selbst `new Worker(src)`, die Datei muss also
 * unter einer eigenen URL liegen und kann nicht mitgebuendelt werden. Der Pfad
 * geht zwingend durch `foundry.utils.getRoute` — ein nackter Modulpfad loest
 * gegen die aktuelle Seiten-URL auf und liefert 404.
 *
 * Faellt der Worker aus, laeuft pdf.js im Hauptfaden weiter und friert dabei
 * die Oberflaeche ein. Das ist ein Notnagel, kein Betriebszustand, und wird
 * deshalb laut gemeldet.
 */
export function richteEin(): void {
  if (eingerichtet) return;
  eingerichtet = true;

  pdfjs.GlobalWorkerOptions.workerSrc = foundry.utils.getRoute(
    `modules/${MODULE_ID}/dist/pdf.worker.min.mjs`,
  );
}

/**
 * Die Parameter fuer `getDocument`.
 *
 * `standard` ist die deterministische Fassung: keine Systemschriften, keine
 * FontFace-Objekte, die mitgelieferten Standardschriften. Der Extractor setzt
 * in Node `useSystemFonts: true` — das bedeutet dort etwas anderes als im
 * Browser, deshalb ist `systemschriften` als Gegenprobe vorgesehen. Welche
 * Fassung dieselben Schriftnamen liefert, entscheidet der Vergleich des
 * Schriftprofils gegen das des Extractors, nicht eine Vermutung.
 *
 * `isEvalSupported: false` haelt pdf.js von `eval` fern; in Foundry kann eine
 * Inhaltsrichtlinie das ohnehin untersagen.
 *
 * Keine `cMapUrl`: die vordefinierten Zeichenkodierungen werden nur fuer CJK
 * gebraucht, und die Paizo-Hefte sind lateinisch gesetzt.
 */
export function dokumentParameter(variante: PdfjsParameter = 'standard'): Record<string, unknown> {
  return {
    isEvalSupported: false,
    standardFontDataUrl: foundry.utils.getRoute(`modules/${MODULE_ID}/dist/standard_fonts/`),
    useSystemFonts: variante === 'systemschriften',
    disableFontFace: variante === 'standard',
  };
}

export { pdfjs };
