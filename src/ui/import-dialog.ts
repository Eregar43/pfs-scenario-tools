import { L } from '../i18n.ts';
import { szenarioAusDatei, type Leseergebnis } from '../lesen.ts';
import { leseberichtAn } from '../settings.ts';
import { protokolliereBericht, zeigeBericht } from './report-dialog.ts';
import { zeigeWeltDialog } from './welt-dialog.ts';

/**
 * Der Dialog, mit dem ein Szenario-PDF gewaehlt und gelesen wird.
 *
 * `DialogV2` mit von Hand gebautem DOM, wie in `showstopping_tools` — kein
 * Handlebars, kein `templates/`. Zu beachten ist dabei, dass DialogV2 den
 * Inhalt vor dem Anzeigen **klont**: gehaltene Element-Verweise sind danach
 * tot, Werte muessen ueber `button.form.elements` geholt werden.
 */

/** Ab hier gilt die Erkennung als geprueft. */
const GEPRUEFT_AB_SEASON = 8;

function absatz(text: string, klasse?: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  if (klasse) p.className = klasse;
  return p;
}

function baueInhalt(): HTMLElement {
  const inhalt = document.createElement('div');

  const feld = document.createElement('div');
  feld.className = 'form-group';

  const beschriftung = document.createElement('label');
  beschriftung.textContent = L('Import.Datei');

  const eingabe = document.createElement('input');
  eingabe.type = 'file';
  eingabe.name = 'pdf';
  eingabe.accept = 'application/pdf';
  eingabe.required = true;
  // Mehrere Hefte auf einmal: gelesen und geschrieben wird trotzdem eines nach
  // dem anderen — siehe `zeigeImportDialog`.
  eingabe.multiple = true;

  feld.append(beschriftung, eingabe);

  const hinweis = absatz(L('Import.Hinweis'), 'notes');

  inhalt.append(feld, hinweis);
  return inhalt;
}

/**
 * Zeigt den Dialog, liest die gewaehlten PDFs und fuehrt sie in die Welt.
 *
 * **Eines nach dem anderen, nicht alle auf einmal.** Jedes Heft wird gelesen,
 * gezeigt, entschieden und geschrieben, bevor das naechste an die Reihe kommt.
 * Zwei Gruende: So liegt immer nur ein Heft mit seinen entpackten Bildern im
 * Speicher, und die Vorschau bleibt das, was sie sein soll — die Stelle, an
 * der man **dieses** Heft prueft, bevor etwas geschrieben wird.
 *
 * Bei mehreren Dateien entfaellt der Lesebericht **als Dialog** in jedem Fall.
 * Er ist eine Diagnose fuers Einzelheft und stuende sonst als zweiter Dialog
 * vor jedem Heft — auch dann, wenn die Einstellung ihn eingeschaltet hat.
 * Verloren geht er trotzdem nicht: `lies` schreibt ihn immer in die Konsole.
 * Die beiden Warnungen, auf die es ankommt, kommen weiterhin auch als Meldung.
 */
export async function zeigeImportDialog(): Promise<Leseergebnis | undefined> {
  const gewaehlt = (await foundry.applications.api.DialogV2.wait({
    window: { title: L('Import.Titel') },
    content: baueInhalt(),
    buttons: [
      {
        action: 'lesen',
        label: L('Import.Lesen'),
        icon: 'fa-solid fa-file-import',
        default: true,
        // Der Wert kommt aus dem Formular des Knopfes, nicht aus einem
        // festgehaltenen Verweis — der zeigte auf den ungeklonten Inhalt.
        callback: (_event: unknown, button: { form: HTMLFormElement }) => {
          const feld = button.form.elements.namedItem('pdf') as HTMLInputElement | null;
          return feld?.files ? [...feld.files] : null;
        },
      },
      { action: 'abbrechen', label: L('Import.Abbrechen'), icon: 'fa-solid fa-xmark' },
    ],
    rejectClose: false,
  })) as File[] | null | 'abbrechen';

  if (!gewaehlt || typeof gewaehlt === 'string' || gewaehlt.length === 0) return undefined;

  // Ein einzelnes Heft geht den gewohnten Weg, mit Lesebericht.
  if (gewaehlt.length === 1) return leseMitFortschritt(gewaehlt[0]!);

  await lesStapel(gewaehlt);
  return undefined;
}

/**
 * Liest mehrere Hefte nacheinander und fuehrt jedes einzeln in die Welt.
 *
 * Bricht der Anwender an einem Heft ab, wird nur dieses ausgelassen; erst
 * `Alle abbrechen` beendet den Durchlauf. Ein Lesefehler haelt den Stapel
 * ebenfalls nicht auf — er wird gemeldet und das naechste Heft angefangen.
 */
async function lesStapel(dateien: File[]): Promise<void> {
  const version = game.modules.get('pfs-scenario-tools')?.version;
  let geschrieben = 0;
  let uebersprungen = 0;
  let abgebrochen = false;

  for (const [i, datei] of dateien.entries()) {
    const ergebnis = await lies(datei);
    if (!ergebnis) {
      uebersprungen++;
      continue;
    }

    warneWennNoetig(ergebnis);
    const entscheidung = await zeigeWeltDialog(ergebnis, version, {
      nummer: i + 1,
      gesamt: dateien.length,
    });

    if (entscheidung === 'geschrieben') geschrieben++;
    else uebersprungen++;

    if (entscheidung === 'abgebrochen') {
      // Das laufende Heft ist oben schon als ausgelassen gezaehlt; hier kommen
      // die noch nicht angefassten dazu. Am Ende muss die Summe aus
      // Geschriebenem und Ausgelassenem die Zahl der Dateien ergeben — sonst
      // haette die Schlussmeldung Hefte verschluckt.
      abgebrochen = true;
      uebersprungen += dateien.length - i - 1;
      break;
    }
  }

  // Beide Saetze ausgeschrieben statt den Schluessel mit einem Fragezeichen zu
  // waehlen: Sonst sieht `tools/pruefe.mjs` keinen von beiden und haelt sie
  // fuer unbenutzt.
  const zahlen = { geschrieben, uebersprungen, gesamt: dateien.length };
  ui.notifications?.info(
    abgebrochen ? L('Import.StapelAbgebrochen', zahlen) : L('Import.StapelFertig', zahlen),
    { permanent: true },
  );
}

/**
 * Liest ein einzelnes Heft und fuehrt es in die Welt.
 *
 * Der Lesebericht erscheint nur, wenn die Einstellung es sagt — sie steht
 * standardmaessig auf aus. In die Konsole schreibt `lies` ihn ohnehin immer.
 *
 * Ohne Bericht geht es direkt zur Vorschau. Damit ist auch der Knopf
 * „journal.json herunterladen" nicht mehr erreichbar; er sitzt in diesem
 * Fenster, und dafuer ist die Einstellung da.
 */
export async function leseMitFortschritt(datei: File): Promise<Leseergebnis | undefined> {
  const ergebnis = await lies(datei);
  if (!ergebnis) return undefined;

  warneWennNoetig(ergebnis);
  if (leseberichtAn()) {
    await zeigeBericht(ergebnis);
    return ergebnis;
  }

  await zeigeWeltDialog(ergebnis, game.modules.get('pfs-scenario-tools')?.version);
  return ergebnis;
}

/**
 * Liest eine Datei mit Foundrys eigenem Fortschrittsbalken.
 *
 * Die Meldung wird in jedem Fall entfernt — auch wenn das Lesen fehlschlaegt,
 * sonst bliebe ein Balken bei 40 Prozent stehen.
 */
async function lies(datei: File): Promise<Leseergebnis | undefined> {
  const meldung = ui.notifications?.info(L('Import.Laeuft', { datei: datei.name }), {
    permanent: true,
    progress: true,
    console: false,
  });

  try {
    const ergebnis = await szenarioAusDatei(datei, {
      fortschritt: (seite, von) => {
        meldung?.update({ message: L('Import.Seite', { seite, von }), pct: seite / von });
      },
    });
    meldung?.remove();
    // Vor allem Weiteren: Der Bericht steht damit auch dann in der Konsole,
    // wenn der Anwender die Vorschau abbricht oder der Stapel den Dialog
    // gar nicht erst zeigt.
    protokolliereBericht(ergebnis);
    return ergebnis;
  } catch (fehler) {
    meldung?.remove();
    console.error('pfs-scenario-tools | Lesen fehlgeschlagen', fehler);
    ui.notifications?.error(L('Import.Fehlgeschlagen', { fehler: String(fehler) }));
    return undefined;
  }
}

/**
 * Die zwei Befunde, bei denen dem Ergebnis nicht zu trauen ist, gehoeren
 * sichtbar in die Oberflaeche und nicht nur ins Protokoll.
 *
 * Beide bedeuten dasselbe: Die Rollenerkennung hat keinen Schriftnamen, an dem
 * sie sich festhalten kann. Der Text kommt dann vollstaendig an, aber ohne
 * Gliederung — ein Journal aus einer einzigen langen Seite.
 */
function warneWennNoetig({ szenario, unresolved }: Leseergebnis): void {
  if (unresolved.anzahl > 0) {
    ui.notifications?.error(
      L('Import.WarnungSchriftverweise', {
        anzahl: unresolved.anzahl,
        verweise: [...unresolved.verweise].join(', '),
      }),
      { permanent: true },
    );
  }

  const unbekannt = szenario.profile.schriften.filter((schrift) => !schrift.erkannt);
  if (unbekannt.length > 0) {
    ui.notifications?.warn(
      L('Import.WarnungSchriften', { schriften: unbekannt.map((s) => s.name).join(', ') }),
      { permanent: true },
    );
  }

  const season = szenario.designation?.season;
  if (season !== undefined && season < GEPRUEFT_AB_SEASON) {
    ui.notifications?.warn(L('Import.WarnungJahrgang', { season }), { permanent: true });
  }
}
