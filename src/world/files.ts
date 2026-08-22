/**
 * Ablage im Datenbaum der Welt: Ordner anlegen, Dateien hochladen.
 *
 * Beides laeuft ueber `foundry.applications.apps.FilePicker.implementation` —
 * das seit v13 veraltete Global gibt es hier nicht. Und beim `upload` ist das
 * vierte Argument der POST-Body; `{notify: false}` gehoert ins fuenfte.
 */

/** Die Quelle ist immer der Datenbaum der Welt, nie S3 oder der Core. */
const QUELLE = 'data';

/**
 * Legt einen Pfad an, Stueck fuer Stueck.
 *
 * `createDirectory` kennt kein `recursive` und wirft, wenn es den Ordner schon
 * gibt — dieser Fall ist hier der Normalfall (jeder zweite Import) und darum
 * kein Fehler. Alles andere (fehlende Rechte, gesperrter Pfad) bleibt einer.
 */
export async function stelleOrdnerSicher(pfad: string): Promise<void> {
  const picker = foundry.applications.apps.FilePicker.implementation;
  let bisher = '';

  for (const teil of pfad.split('/').filter((t) => t !== '')) {
    bisher = bisher === '' ? teil : `${bisher}/${teil}`;
    try {
      await picker.createDirectory(QUELLE, bisher);
    } catch (fehler) {
      if (!String(fehler).includes('EEXIST')) throw fehler;
    }
  }
}

/**
 * Zaehlt die Dateien in einem Ordner des Datenbaums.
 *
 * `undefined` heisst **„nicht nachsehbar"** und ist etwas anderes als `0`:
 * Den Ordner gibt es nicht, oder der Dateibrowser sagt nichts. Die
 * Vollstaendigkeitsprobe soll beides auseinanderhalten — ein leerer Ordner
 * ist ein Befund, ein fehlender eine offene Frage.
 */
export async function zaehleDateien(pfad: string): Promise<number | undefined> {
  if (pfad === '') return undefined;
  try {
    const picker = foundry.applications.apps.FilePicker.implementation;
    const antwort = (await picker.browse(QUELLE, pfad)) as { files?: unknown[] } | undefined;
    return Array.isArray(antwort?.files) ? antwort.files.length : undefined;
  } catch {
    // Ordner weg, keine Rechte, S3 nicht erreichbar — alles derselbe Befund:
    // Wir wissen es nicht.
    return undefined;
  }
}

/**
 * Laedt eine Datei hoch und prueft die Antwort.
 *
 * `upload` meldet Fehlschlaege nicht nur als Ausnahme, sondern auch als
 * `false` — wer die Antwort nicht ansieht, haelt einen stillen Fehlschlag
 * fuer einen Erfolg.
 */
export async function ladeHoch(ordner: string, dateiname: string, blob: Blob): Promise<string> {
  const picker = foundry.applications.apps.FilePicker.implementation;
  const datei = new File([blob], dateiname, { type: blob.type });

  const antwort = (await picker.upload(QUELLE, ordner, datei, {}, { notify: false })) as
    | { path?: string }
    | false
    | undefined;

  if (!antwort || typeof antwort.path !== 'string') {
    throw new Error(`Hochladen von ${dateiname} nach ${ordner} fehlgeschlagen`);
  }
  return antwort.path;
}
