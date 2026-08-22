#!/usr/bin/env node
/**
 * Prueft die Zusagen, die kein Typpruefer und kein Test abdeckt.
 *
 * Anlass fuer den ersten Punkt war ein Screenshot: in einem englischen Foundry
 * kam die Vorschau halb deutsch heraus, weil vier Saetze fest verdrahtet in
 * `world/plan.ts` standen. Das soll kuenftig hier auffallen und nicht dort.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SPRACHEN = ['de', 'en'];
let fehler = 0;

function melde(text) {
  console.error(`  FEHLER  ${text}`);
  fehler++;
}

function quelldateien(verzeichnis) {
  const gefunden = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) gefunden.push(...quelldateien(pfad));
    else if (pfad.endsWith('.ts')) gefunden.push(pfad);
  }
  return gefunden;
}

/** Kommentare weg, damit Beispiele darin nicht als Code zaehlen. */
function ohneKommentare(quelle) {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const dateien = quelldateien('src');
const woerterbuecher = Object.fromEntries(
  SPRACHEN.map((sprache) => [
    sprache,
    JSON.parse(readFileSync(`languages/${sprache}.json`, 'utf8')),
  ]),
);

// 1. Beide Sprachen fuehren dieselben Schluessel.
{
  const [a, b] = SPRACHEN;
  const nurA = Object.keys(woerterbuecher[a]).filter((k) => !(k in woerterbuecher[b]));
  const nurB = Object.keys(woerterbuecher[b]).filter((k) => !(k in woerterbuecher[a]));
  for (const k of nurA) melde(`${k} fehlt in ${b}.json`);
  for (const k of nurB) melde(`${k} fehlt in ${a}.json`);
}

// 2. Jeder benutzte Schluessel ist uebersetzt.
const dynamisch = [];
const benutzt = new Set();
for (const datei of dateien) {
  const quelle = ohneKommentare(readFileSync(datei, 'utf8'));
  for (const treffer of quelle.matchAll(/\bL\(\s*(['"`])([^'"`]+)\1/g)) {
    benutzt.add(`PFSST.${treffer[2]}`);
  }
  // `L(schluessel, ...)` mit einer Variablen laesst sich hier nicht aufloesen.
  for (const treffer of quelle.matchAll(/\bL\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    dynamisch.push(`${datei}: L(${treffer[1]}, ...)`);
  }
}
for (const schluessel of [...benutzt].sort()) {
  for (const sprache of SPRACHEN) {
    if (!(schluessel in woerterbuecher[sprache])) {
      melde(`${schluessel} wird benutzt, fehlt aber in ${sprache}.json`);
    }
  }
}

// 3. Kein Anzeigetext fest im Code.
//
// Die Kommentare dieses Repos schreiben Umlaute als ue/ae/oe aus. Ein Umlaut
// in einer Zeichenkette ist deshalb ein verlaessliches Zeichen dafuer, dass
// dort deutscher Anzeigetext steht, der in die Sprachdateien gehoert.
for (const datei of dateien) {
  const zeilen = ohneKommentare(readFileSync(datei, 'utf8')).split('\n');
  zeilen.forEach((zeile, i) => {
    if (/[äöüÄÖÜß]/.test(zeile)) {
      melde(`${datei}:${i + 1} enthaelt einen Umlaut — gehoert der Text in die Sprachdateien?`);
    }
  });
}

// 4. Die PDF-Schicht bleibt frei von Foundry und von Node.
// Auf die Ordnergrenze achten: `src/pdfjs/` faengt genauso an wie `src/pdf/`,
// gehoert aber zur Foundry-Seite und darf `foundry.utils.getRoute` benutzen.
const PDF_SCHICHT = `${join('src', 'pdf')}/`;
for (const datei of dateien.filter((d) => d.startsWith(PDF_SCHICHT))) {
  const quelle = ohneKommentare(readFileSync(datei, 'utf8'));
  for (const [muster, was] of [
    [/from\s+['"]node:/, 'einen Node-Import'],
    [/\bgame\./, 'einen Zugriff auf game'],
    [/\bfoundry\./, 'einen Zugriff auf foundry'],
    [/\bui\.notifications/, 'einen Zugriff auf ui.notifications'],
  ]) {
    if (muster.test(quelle)) {
      melde(`${datei} enthaelt ${was} — src/pdf/ muss ohne Foundry und ohne Node laufen`);
    }
  }
}

// 5. Jedes Feld, das der Statblock-Abgleich melden kann, ist uebersetzt.
//
// Der Feldname wandert als blosse Zeichenkette durch `Abweichung.feld` und
// wird erst im Dialog uebersetzt. Faellt dort ein Fall unter den Tisch, zeigt
// die Vorschau den rohen Bezeichner — ohne Fehler, ohne Warnung. Genau das
// soll hier auffallen.
{
  const abgleich = ohneKommentare(readFileSync(join('src', 'world', 'statblock-abgleich.ts'), 'utf8'));
  const dialog = ohneKommentare(readFileSync(join('src', 'ui', 'welt-dialog.ts'), 'utf8'));
  const felder = new Set();
  for (const treffer of abgleich.matchAll(/\bfeld:\s*'([^']+)'/g)) felder.add(treffer[1]);
  for (const treffer of abgleich.matchAll(/melde\(\s*'([^']+)'/g)) felder.add(treffer[1]);
  for (const treffer of abgleich.matchAll(/\['(\w+)',\s*'([A-ZÄÖÜ][^']*)'\]/g)) felder.add(treffer[2]);
  for (const feld of [...felder].sort()) {
    if (!dialog.includes(`case '${feld}':`)) {
      melde(`Statblock-Abgleich meldet das Feld ${feld}, welt-dialog.ts uebersetzt es nicht`);
    }
    for (const sprache of SPRACHEN) {
      if (!(`PFSST.Welt.Feld.${feld}` in woerterbuecher[sprache])) {
        melde(`PFSST.Welt.Feld.${feld} fehlt in ${sprache}.json`);
      }
    }
  }
  console.log(`Felder des Statblock-Abgleichs: ${felder.size}, alle uebersetzt`);
}

const schluesselzahl = Object.keys(woerterbuecher[SPRACHEN[0]]).length;
console.log(`Sprachschluessel: ${schluesselzahl} je Sprache, ${benutzt.size} davon fest benutzt`);
if (dynamisch.length > 0) {
  console.log(`Ueber eine Variable gebaut (nicht pruefbar): ${dynamisch.length}`);
  for (const stelle of dynamisch) console.log(`  ${stelle}`);
}

if (fehler > 0) {
  console.error(`\n${fehler} Beanstandung(en).`);
  process.exit(1);
}
console.log('Alles in Ordnung.');
