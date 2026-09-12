/**
 * Der eine Griff ins Dateisystem, den die Tests brauchen — und keiner mehr.
 *
 * `tsconfig.json` fuehrt `"types": []`: Es gibt in diesem Repo bewusst keine
 * Node-Typen, wie es auch fuer Foundry nur `src/foundry-shim.d.ts` gibt statt
 * `foundry-vtt-types`. Die Begruendung ist dieselbe — eine eigene kleine
 * Deklaration ist zugleich die Liste dessen, was wirklich benutzt wird.
 *
 * Gebraucht wird es nur in `test/`: Der Kartenexport soll Zeichen fuer
 * Zeichen dieselbe Wanddatei schreiben wie `tools/exportiere-waende.mjs`, und
 * das laesst sich nur gegen die Dateien im Repo pruefen. In `src/` hat Node
 * nichts zu suchen, dort laeuft alles im Browser.
 *
 * Sollte je `@types/node` dazukommen, ist diese Datei zu loeschen — zwei
 * Deklarationen desselben Moduls widersprechen sich.
 */
declare module 'node:fs' {
  export function readFileSync(pfad: string, kodierung: 'utf8'): string;
}
