import { L } from '../i18n.ts';
import { fasseZusammen, type Leseergebnis } from '../lesen.ts';
import { buildJournal } from '../pdf/journal.ts';
import type { Designation } from '../pdf/season.ts';
import { zeigeWeltDialog } from './welt-dialog.ts';
import { MODULE_ID } from '../world/flags.ts';

/**
 * Zeigt, was aus dem PDF geworden ist, und bietet das Ergebnis zum
 * Herunterladen an.
 *
 * Solange es die Weltablage noch nicht gibt, ist das der ganze Zweck des
 * Werkzeugs: eine `journal.json`, die sich gegen den Lauf des Extractors
 * halten laesst.
 */

/**
 * Der Name, den der Extractor vergibt (`S08-01 - Titel`).
 *
 * Ausdruecklich **nicht** das Namensschema, das spaeter in der Welt gilt —
 * diese Datei ist zum Vergleichen da, und dafuer muss sie aussehen wie das
 * Gegenstueck. Die Weltnamen entstehen in `src/world/naming.ts`.
 */
function extractorName(designation: Designation | undefined, titel: string): string {
  if (!designation) return titel;
  const nummer = String(designation.scenario).padStart(2, '0');
  return `S${String(designation.season).padStart(2, '0')}-${nummer} - ${titel}`;
}

function zeile(tabelle: HTMLTableSectionElement, name: string, wert: string): void {
  const tr = document.createElement('tr');
  const td1 = document.createElement('td');
  td1.textContent = name;
  const td2 = document.createElement('td');
  td2.textContent = wert;
  td2.style.textAlign = 'right';
  tr.append(td1, td2);
  tabelle.append(tr);
}

function baueInhalt(ergebnis: Leseergebnis): HTMLElement {
  const z = fasseZusammen(ergebnis);
  const inhalt = document.createElement('div');

  const titel = document.createElement('h3');
  titel.textContent = String(z.titel);
  inhalt.append(titel);

  const tabelle = document.createElement('table');
  const koerper = document.createElement('tbody');
  tabelle.append(koerper);

  zeile(koerper, L('Bericht.Kennung'), String(z.kennung));
  zeile(koerper, L('Bericht.Seiten'), String(z.seiten));
  zeile(koerper, L('Bericht.Bloecke'), String(z.bloecke));
  zeile(koerper, L('Bericht.Schriften'), String(z.schriften));

  const rollen = z.rollen as Record<string, number>;
  for (const name of Object.keys(rollen).sort()) {
    zeile(koerper, `  ${name}`, String(rollen[name]));
  }

  inhalt.append(tabelle);

  // Die beiden Zahlen, an denen haengt, ob dem Ergebnis zu trauen ist.
  const unbekannt = z.unbekannteSchriften as string[];
  const verweise = z.unaufgeloesteSchriftverweise as number;
  if (unbekannt.length > 0 || verweise > 0) {
    const warnung = document.createElement('p');
    warnung.className = 'notification warning';
    warnung.textContent =
      verweise > 0
        ? L('Bericht.WarnungVerweise', { anzahl: verweise })
        : L('Bericht.WarnungSchriften', { schriften: unbekannt.join(', ') });
    inhalt.append(warnung);
  }

  return inhalt;
}

/**
 * Schreibt denselben Bericht in die Browser-Konsole.
 *
 * Noetig geworden mit dem Stapel-Import: Dort entfaellt der Dialog, und die
 * Kennzahlen waeren sonst weg — gerade dann, wenn man vier Hefte hintereinander
 * laufen laesst und hinterher wissen will, welches gehakt hat.
 *
 * Die Beschriftungen kommen aus denselben Sprachschluesseln wie im Dialog. Fest
 * verdrahteter deutscher Text hat auch in der Konsole nichts zu suchen — und
 * `tools/pruefe.mjs` wuerde ihn am Umlaut erkennen.
 *
 * Zusammengeklappt, damit vier Hefte die Konsole nicht fluten.
 */
export function protokolliereBericht(ergebnis: Leseergebnis): void {
  const z = fasseZusammen(ergebnis);
  const unbekannt = z['unbekannteSchriften'] as string[];
  const verweise = z['unaufgeloesteSchriftverweise'] as number;

  console.groupCollapsed(`${MODULE_ID} | ${L('Bericht.Titel')}: ${String(z['titel'])}`);
  console.log(`${L('Bericht.Kennung')}: ${String(z['kennung'])}`);
  console.log(`${L('Bericht.Seiten')}: ${String(z['seiten'])}`);
  console.log(`${L('Bericht.Bloecke')}: ${String(z['bloecke'])}`);
  console.log(`${L('Bericht.Schriften')}: ${String(z['schriften'])}`);
  console.table(z['rollen']);

  // Die beiden Zahlen, an denen haengt, ob dem Ergebnis zu trauen ist —
  // als Warnung, damit sie in einer zugeklappten Gruppe trotzdem auffallen.
  if (verweise > 0) console.warn(L('Bericht.WarnungVerweise', { anzahl: verweise }));
  if (unbekannt.length > 0) {
    console.warn(L('Bericht.WarnungSchriften', { schriften: unbekannt.join(', ') }));
  }
  console.groupEnd();
}

export async function zeigeBericht(ergebnis: Leseergebnis): Promise<void> {
  const antwort = await foundry.applications.api.DialogV2.wait({
    window: { title: L('Bericht.Titel') },
    content: baueInhalt(ergebnis),
    buttons: [
      {
        action: 'welt',
        label: L('Bericht.InDieWelt'),
        icon: 'fa-solid fa-book',
        default: true,
      },
      {
        action: 'herunterladen',
        label: L('Bericht.Herunterladen'),
        icon: 'fa-solid fa-download',
      },
      { action: 'schliessen', label: L('Bericht.Schliessen'), icon: 'fa-solid fa-xmark' },
    ],
    rejectClose: false,
  });

  if (antwort === 'welt') {
    await zeigeWeltDialog(ergebnis, game.modules.get('pfs-scenario-tools')?.version);
    return;
  }

  if (antwort !== 'herunterladen') return;

  const { szenario } = ergebnis;
  const name = extractorName(szenario.designation, szenario.title);
  const journal = buildJournal(szenario, name);
  foundry.utils.saveDataToFile(
    JSON.stringify(journal, null, 2),
    'application/json',
    'journal.json',
  );
}
