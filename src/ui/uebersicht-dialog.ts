import { L } from '../i18n.ts';
import { bildWurzel } from '../settings.ts';
import { verwaisteSeasonOrdner, type SzenarioBestand } from '../world/bestand.ts';
import { szenarioBildOrdner } from '../world/bilder.ts';
import { entferneOrdner, entferneSzenario } from '../world/entfernen.ts';
import { weltabbild } from '../world/journal.ts';

/**
 * Das Entfernen eines Szenarios: die Bestaetigung mit vollstaendiger
 * Aufzaehlung und der Griff selbst.
 *
 * Die Liste der importierten Szenarien steht seit dem Verwaltungsfenster
 * nicht mehr hier (`ui/verwaltung-app.ts`) — beide sehen aber weiterhin
 * denselben `SzenarioBestand`, und geloescht wird exakt, was diese
 * Bestaetigung aufgezaehlt hat.
 */

export async function bestaetigeUndEntferne(bestaende: SzenarioBestand[]): Promise<void> {
  const namen = bestaende.map((bestand) => bestand.journal?.name ?? bestand.schluessel);

  const inhalt = document.createElement('div');
  const frage = document.createElement('p');
  frage.textContent =
    bestaende.length === 1
      ? L('Uebersicht.BestaetigenFrage', { name: namen[0] })
      : L('Uebersicht.BestaetigenFrageMehrere', { anzahl: bestaende.length });
  inhalt.append(frage);

  for (const bestand of bestaende) {
    if (bestaende.length > 1) {
      const titel = document.createElement('p');
      const fett = document.createElement('strong');
      fett.textContent = bestand.journal?.name ?? bestand.schluessel;
      titel.append(fett);
      titel.style.marginBottom = '0';
      inhalt.append(titel);
    }

    const liste = document.createElement('ul');
    const zeile = (text: string): void => {
      const li = document.createElement('li');
      li.textContent = text;
      liste.append(li);
    };
    if (bestand.journal) {
      zeile(`${bestand.journal.name} (${L('Uebersicht.TeilJournal', { seiten: bestand.journal.seiten })})`);
    }
    if (bestand.anhang) {
      zeile(`${bestand.anhang.name} (${L('Uebersicht.TeilAnhang', { seiten: bestand.anhang.seiten })})`);
    }
    for (const szene of bestand.szenen) zeile(szene.name);
    for (const aktor of bestand.aktoren) zeile(aktor.name);
    for (const ordner of bestand.ordner) zeile(ordner.name);
    inhalt.append(liste);
  }

  // Vor dem ersten Griff gerechnet: Der Season-Ordner faellt nur, wenn nach
  // dem Zug nichts mehr darin steht. Er gehoert in die Aufzaehlung — geloescht
  // wird exakt, was hier steht.
  const leereSeasonOrdner = verwaisteSeasonOrdner(weltabbild(), bestaende);
  if (leereSeasonOrdner.length > 0) {
    const namen = [...new Set(leereSeasonOrdner.map((ordner) => ordner.name))];
    const satz = document.createElement('p');
    satz.textContent = L('Uebersicht.SeasonOrdnerLeer', { namen: namen.join(', ') });
    inhalt.append(satz);
  }

  const wurzel = bildWurzel();
  if (wurzel !== '') {
    const hinweis = document.createElement('p');
    hinweis.className = 'notification info';
    hinweis.textContent = L('Uebersicht.BilderBleiben', {
      pfad: bestaende
        .map(
          (bestand) =>
            `${wurzel.replace(/\/+$/, '')}/${szenarioBildOrdner(bestand.schluessel)}/`,
        )
        .join(', '),
    });
    inhalt.append(hinweis);
  }

  const antwort = await foundry.applications.api.DialogV2.wait({
    window: { title: L('Uebersicht.BestaetigenTitel') },
    content: inhalt,
    buttons: [
      { action: 'loeschen', label: L('Uebersicht.Loeschen'), icon: 'fa-solid fa-trash' },
      {
        action: 'abbrechen',
        label: L('Uebersicht.Abbrechen'),
        icon: 'fa-solid fa-xmark',
        default: true,
      },
    ],
    rejectClose: false,
  });

  if (antwort !== 'loeschen') return;

  // Nacheinander, und beim ersten Fehler halt: was schon entfernt ist, steht
  // in der Meldung — was noch da ist, bleibt sichtbar in der Uebersicht.
  const summe = { journale: 0, szenen: 0, aktoren: 0, ordner: 0 };
  try {
    for (const bestand of bestaende) {
      const entfernt = await entferneSzenario(bestand);
      summe.journale += entfernt.journale;
      summe.szenen += entfernt.szenen;
      summe.aktoren += entfernt.aktoren;
      summe.ordner += entfernt.ordner;
    }
    // Zuletzt die Huellen darueber: erst wenn alle gewaehlten Szenarien
    // draussen sind, ist der Season-Ordner wirklich leer.
    summe.ordner += await entferneOrdner(leereSeasonOrdner);
    ui.notifications?.info(
      bestaende.length === 1
        ? L('Uebersicht.Entfernt', { name: namen[0], ...summe })
        : L('Uebersicht.EntferntMehrere', { anzahl: bestaende.length, ...summe }),
    );
  } catch (fehler) {
    console.error('pfs-scenario-tools | Entfernen fehlgeschlagen', fehler);
    ui.notifications?.error(L('Uebersicht.Fehlgeschlagen', { fehler: String(fehler) }), {
      permanent: true,
    });
  }
}
