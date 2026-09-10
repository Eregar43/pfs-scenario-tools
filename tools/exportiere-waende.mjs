/**
 * Exportiert die Waende einer Szene aus der Testwelt in eine Wanddatei.
 *
 *   node tools/exportiere-waende.mjs "The Laboratory (2)" 08-01/the-laboratory-2
 *
 * Erstes Argument ist der Szenenname in Foundry, zweites der Kartenschluessel
 * (`<szenario>/<datei>`, wie in den KARTEN_EINSTELLUNGEN). Geschrieben wird
 * `daten/waende/<szenario>/<datei>.json`; die Datei muss danach noch in
 * `src/world/waende.ts` eingetragen werden.
 *
 * Gelesen wird direkt aus der LevelDB der Welt (read-only-Mount, die
 * Foundry-Instanz darf dabei laufen). Das ist kein LevelDB-Parser, sondern
 * eine Textsuche ueber .ldb- und .log-Dateien: je Wand-Schluessel gewinnt
 * das letzte Vorkommen, ein Vorkommen ohne folgenden JSON-Wert gilt als
 * geloescht. Fuer Werkzeuggebrauch reicht das; die Ausgabe nennt die Zahl
 * der Waende und Tueren zum Gegenpruefen mit der Szene in Foundry.
 *
 * Einzig die Blockstruktur der .log-Dateien braucht echtes Parsen: Sie sind
 * in 32-KiB-Bloecke geteilt, und ein Datensatz ueber der Blockgrenze traegt
 * mitten im Wert einen 7-Byte-Header. `logNutzlast` setzt die Nutzlasten
 * wieder zusammen, sonst zerreisst es einzelne Waende.
 */
import fs from 'node:fs';
import path from 'node:path';

// Wo die Szenen-Datenbank der Welt liegt. Der Standard passt zu einer
// Foundry-Installation, deren Datenverzeichnis unter `/foundry-data` haengt;
// jede andere gibt ihren Pfad ueber FOUNDRY_SCENES mit.
const WELT =
  process.env.FOUNDRY_SCENES ?? '/foundry-data/worlds/testing-world/data/scenes';

const [szenenName, kartenSchluessel] = process.argv.slice(2);
if (!szenenName || !kartenSchluessel || !/^[^/]+\/[^/]+$/.test(kartenSchluessel)) {
  console.error('Aufruf: node tools/exportiere-waende.mjs "<Szenenname>" <szenario>/<datei>');
  process.exit(1);
}

/** JSON ab einer Position string-bewusst mit Klammerbilanz herausschneiden. */
function schneide(s, i) {
  let tiefe = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') tiefe++;
    else if (c === '}') {
      tiefe--;
      if (tiefe === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

/**
 * Setzt die Nutzlast einer .log-Datei aus ihren 32-KiB-Bloecken zusammen.
 * Jeder physische Datensatz traegt einen 7-Byte-Header (Pruefsumme 4,
 * Laenge 2, Typ 1); fortgesetzte Datensaetze verteilen sich auf mehrere
 * Bloecke. Die Typen sind hier egal — aneinandergehaengt ergeben die
 * Nutzlasten wieder den fortlaufenden Strom.
 */
function logNutzlast(buf) {
  const teile = [];
  for (let block = 0; block < buf.length; block += 32768) {
    const ende = Math.min(block + 32768, buf.length);
    let i = block;
    while (i + 7 <= ende) {
      const laenge = buf.readUInt16LE(i + 4);
      const typ = buf[i + 6];
      if (typ === 0 && laenge === 0) break; // Auffueller bis zur Blockgrenze
      teile.push(buf.subarray(i + 7, Math.min(i + 7 + laenge, ende)));
      i += 7 + laenge;
    }
  }
  return Buffer.concat(teile).toString('latin1');
}

// Dateien in Schreibreihenfolge: erst die .ldb (aelter), dann die .log
// (Write-ahead-Log, juengste Aenderungen) — so gewinnt der neueste Stand.
const dateien = fs
  .readdirSync(WELT)
  .filter((f) => f.endsWith('.ldb'))
  .sort()
  .concat(
    fs
      .readdirSync(WELT)
      .filter((f) => f.endsWith('.log'))
      .sort(),
  );

const szenenNamen = {}; // Szenen-Id -> Name, letztes Vorkommen gewinnt
const stand = {}; // "<szenenId>.<wandId>" -> JSON-Text | null
for (const datei of dateien) {
  const roh = fs.readFileSync(path.join(WELT, datei));
  const s = datei.endsWith('.log') ? logNutzlast(roh) : roh.toString('latin1');

  const szenenRe = /!scenes!([A-Za-z0-9]{16})/g;
  for (let m; (m = szenenRe.exec(s)); ) {
    const name = s.slice(m.index, m.index + 3000).match(/"name":"([^"]{0,80})"/);
    if (name) szenenNamen[m[1]] = name[1];
  }

  const wandRe = /!scenes\.walls!([A-Za-z0-9]{16})\.([A-Za-z0-9]{16})/g;
  for (let m; (m = wandRe.exec(s)); ) {
    const rel = s.slice(wandRe.lastIndex, wandRe.lastIndex + 6).indexOf('{');
    stand[`${m[1]}.${m[2]}`] = rel >= 0 && rel <= 4 ? schneide(s, wandRe.lastIndex + rel) : null;
  }
}

// Die Datenbank wird als latin1 gelesen (Byte fuer Byte, wegen der
// Blockstruktur); ein Szenenname mit Apostroph oder Umlaut (`Nan’s Watch`)
// steht dort deshalb als UTF-8-Bytefolge. Der Aufrufer gibt ihn als Text —
// also den Text in dieselbe Bytefolge bringen, sonst gibt es keinen Treffer.
const gesucht = Buffer.from(szenenName, 'utf8').toString('latin1');
const treffer = Object.entries(szenenNamen).filter(([, name]) => name === gesucht);
if (treffer.length !== 1) {
  console.error(
    treffer.length === 0
      ? `Keine Szene namens „${szenenName}" gefunden. Vorhanden: ${Object.values(szenenNamen).map((n) => Buffer.from(n, 'latin1').toString('utf8')).join(', ')}`
      : `Szenenname „${szenenName}" ist mehrdeutig (${treffer.length} Szenen).`,
  );
  process.exit(1);
}
const szenenId = treffer[0][0];

// Nur die Felder, die der Import wieder anlegt — Ids vergibt Foundry neu,
// Fremd-Flags (etwa von einem Levels-Modul) bleiben draussen.
const FELDER = ['c', 'move', 'sight', 'sound', 'light', 'dir', 'door', 'ds', 'threshold', 'animation'];
const waende = [];
// Deckungsgleiche Doppel entstehen nicht beim Zeichnen, sondern waren die
// Altlast des Verdopplungs-Fehlers vom 13.08.2026 — sie fliegen raus, mit
// Meldung, damit ein unerwartet hoher Schwund auffaellt.
const gesehen = new Set();
let doppel = 0;
for (const [schluessel, wert] of Object.entries(stand)) {
  if (!schluessel.startsWith(`${szenenId}.`) || !wert) continue;
  const roh = JSON.parse(wert);
  const wand = {};
  for (const feld of FELDER) if (roh[feld] !== undefined) wand[feld] = roh[feld];
  const kennung = JSON.stringify(wand);
  if (gesehen.has(kennung)) {
    doppel++;
    continue;
  }
  gesehen.add(kennung);
  waende.push(wand);
}
if (doppel > 0) {
  console.warn(`${doppel} deckungsgleiche Duplikate uebersprungen (Altlast der Verdopplung).`);
}
if (waende.length === 0) {
  console.error(`Szene „${szenenName}" hat keine Waende.`);
  process.exit(1);
}

const ziel = path.join('daten/waende', `${kartenSchluessel}.json`);
fs.mkdirSync(path.dirname(ziel), { recursive: true });
fs.writeFileSync(ziel, `${JSON.stringify(waende, null, 2)}\n`);

const tueren = waende.filter((wand) => wand.door > 0).length;
console.log(`${ziel}: ${waende.length} Waende, davon ${tueren} Tueren.`);
console.log('Bitte mit der Szene in Foundry gegenpruefen und in src/world/waende.ts eintragen.');
