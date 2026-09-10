import { L } from '../i18n.ts';
import { sammleKreaturen, type OhneVorlage } from '../pdf/journal.ts';
import { bilderAusBytes, type GelesenesBild, type Leseergebnis } from '../lesen.ts';
import {
  angleichenAn,
  anreichernAn,
  bildWurzel,
  journalNameSchema,
  kreaturVerweise,
  nscActorsAn,
  tokenRingeAn,
  effekteAn,
} from '../settings.ts';
import { reichereAn } from '../world/anreichern.ts';
import { sammleEffekte } from '../pdf/effekte.ts';
import { effektOption } from '../world/effekte.ts';
import { ANACHRONISM_MODUL, anachronismAktiv } from '../world/compendium-index.ts';
import { scenarioKey } from '../world/naming.ts';
import { bildOrdner, bildPfad, type BildFuerSeiten } from '../world/bilder.ts';
import { ladeHoch, stelleOrdnerSicher } from '../world/files.ts';
import { plane, schreibe } from '../world/journal.ts';
import { schluesselwerkeAusSystem } from '../world/gefahren.ts';
import { angleichwerkeAusSystem } from '../world/angleichen.ts';
import { pruefeKreaturen } from '../world/statblock-abgleich.ts';
import type { ImportPlan, OrdnerAktion } from '../world/plan.ts';

/**
 * Die Vorschau in Worte fassen.
 *
 * Das steht hier und nicht in `world/plan.ts`: der Plan ist reine Daten und
 * soll keine Saetze kennen — schon gar keine in einer festen Sprache. Genau
 * das war der Fehler, mit dem die Vorschau anfangs herauskam: Titel und
 * Knoepfe uebersetzt, die Zeilen dazwischen fest auf Deutsch.
 */
function ordnerSatz(aktion: OrdnerAktion): string {
  const schluessel =
    aktion.art === 'anlegen'
      ? 'Welt.OrdnerAnlegen'
      : aktion.art === 'umfaerben'
        ? 'Welt.OrdnerUmfaerben'
        : 'Welt.OrdnerVorhanden';
  return L(schluessel, { name: aktion.name });
}

function beschreibePlan(plan: ImportPlan): string[] {
  const zeilen = [ordnerSatz(plan.seasonOrdner), ordnerSatz(plan.szenarioOrdner)];

  zeilen.push(
    plan.journal.art === 'anlegen'
      ? L('Welt.JournalAnlegen', { name: plan.journal.name })
      : L('Welt.JournalAktualisieren', { name: plan.journal.alterName }),
  );

  const s = plan.seiten;
  zeilen.push(
    L('Welt.Seitenzeile', {
      neu: s.neu.length,
      geaendert: s.aktualisiert.length,
      unveraendert: s.unveraendert.length,
      entfallen: s.entfallen.length,
    }),
  );
  for (const name of s.entfallen) zeilen.push(L('Welt.SeiteEntfaellt', { name }));

  return zeilen;
}

/**
 * Uebersetzt den Feldnamen einer Abweichung.
 *
 * Bewusst ein Schalter mit woertlichen Schluesseln statt eines aus dem
 * Feldnamen zusammengesetzten: Nur so sieht `tools/pruefe.mjs`, dass jeder
 * benutzte Schluessel in beiden Sprachdateien steht. Ein ueber eine Variable
 * gebauter Schluessel ist fuer das Pruefskript unsichtbar — und an genau so
 * einer Stelle ist schon einmal eine halb deutsche Vorschau vorbeigerutscht.
 */
function feldName(feld: string): string {
  switch (feld) {
    case 'Merkmale':
      return L('Welt.Feld.Merkmale');
    case 'Sinne':
      return L('Welt.Feld.Sinne');
    case 'Sprachen':
      return L('Welt.Feld.Sprachen');
    case 'Wahrnehmung':
      return L('Welt.Feld.Wahrnehmung');
    case 'Ruestung':
      return L('Welt.Feld.Ruestung');
    case 'Trefferpunkte':
      return L('Welt.Feld.Trefferpunkte');
    case 'Tempo':
      return L('Welt.Feld.Tempo');
    case 'Zaehigkeit':
      return L('Welt.Feld.Zaehigkeit');
    case 'Reflex':
      return L('Welt.Feld.Reflex');
    case 'Wille':
      return L('Welt.Feld.Wille');
    case 'STR':
      return L('Welt.Feld.STR');
    case 'DEX':
      return L('Welt.Feld.DEX');
    case 'CON':
      return L('Welt.Feld.CON');
    case 'INT':
      return L('Welt.Feld.INT');
    case 'WIS':
      return L('Welt.Feld.WIS');
    case 'CHA':
      return L('Welt.Feld.CHA');
    case 'Fertigkeit':
      return L('Welt.Feld.Fertigkeit');
    case 'Angriff':
      return L('Welt.Feld.Angriff');
    case 'Faehigkeiten':
      return L('Welt.Feld.Faehigkeiten');
    default:
      return feld;
  }
}

/** Wie der Anwender die Vorschau verlassen hat. */
export type Weltentscheidung = 'geschrieben' | 'uebersprungen' | 'abgebrochen';

/**
 * Zeigt, was der Import in der Welt anrichten wuerde — und fuehrt ihn erst
 * nach ausdruecklicher Bestaetigung aus.
 *
 * Der Plan ist reine Daten aus `world/plan.ts`; diese Datei uebersetzt ihn nur
 * in Saetze. Dass beides getrennt ist, ist der Grund, warum die Vorschau
 * ueberhaupt moeglich ist: nichts von dem, was hier steht, hat vorher schon
 * etwas geschrieben.
 *
 * Beim Stapel (mehrere PDFs auf einmal) bekommt der Dialog seinen Zaehler und
 * einen dritten Knopf: `Abbrechen` laesst nur dieses Heft aus, `Alle
 * abbrechen` beendet den Durchlauf. Ohne diese Unterscheidung waere ein
 * uebersprungenes Heft nicht von einem Abbruch zu trennen.
 */
export async function zeigeWeltDialog(
  ergebnis: Leseergebnis,
  version?: string,
  stapel?: { nummer: number; gesamt: number },
): Promise<Weltentscheidung> {
  // Angereichert wird erst hier, nicht schon beim Lesen: der Aufbau der
  // Kompendium-Indizes kostet Zeit, und wer nur die Datei herunterladen will,
  // soll nicht darauf warten.
  const anreichern = anreichernAn();
  const meldung = anreichern
    ? ui.notifications?.info(L('Welt.IndizesLaden'), { permanent: true, console: false })
    : undefined;

  // Die Wurf-Optionen muessen **vor** der Anreicherung feststehen: Sie gehen
  // in die `@Check[…]`-Verweise, die dabei entstehen. Gelesen wird dafuer am
  // rohen Szenario — die Saetze der Zusagen tragen keine Probe, sie sehen
  // vorher und nachher gleich aus.
  const optionenJeSeite = new Map<number, string[]>();
  const kennung = ergebnis.szenario.designation;
  if (effekteAn() && kennung) {
    for (const effekt of sammleEffekte(ergebnis.szenario.blocks)) {
      const option = effektOption(effekt, scenarioKey(kennung));
      if (option && effekt.seite !== undefined) {
        optionenJeSeite.set(effekt.seite, [
          ...(optionenJeSeite.get(effekt.seite) ?? []),
          option,
        ]);
      }
    }
  }

  const { szenario, indizes } = anreichern
    ? await reichereAn(ergebnis.szenario, optionenJeSeite)
    : { szenario: ergebnis.szenario, indizes: undefined };

  meldung?.remove();

  // Der Bilderlauf braucht die Kennung (fuer die Ablagepfade) und eine
  // gewaehlte Bildwurzel. Er laeuft ueber das **unangereicherte** Szenario —
  // wie im Extractor, wo die Bilder am schlichten Fliesstext benannt werden.
  const wurzel = bildWurzel();
  const { bilder, pfade, anhangTitel } = await sammleBilder(ergebnis, wurzel);

  const anhangBilder = bilder
    .map((bild, index) => ({ bild, pfad: pfade[index]!.pfad }))
    .filter(({ bild }) => bild.anhang)
    .map(({ bild, pfad }) => ({
      file: bild.file,
      ...(bild.name !== undefined ? { name: bild.name } : {}),
      pfad,
    }));

  const karten = bilder
    .map((bild, index) => ({ bild, pfad: pfade[index]!.pfad }))
    // Einschuebe (Karte mit Kastentitel, etwa die Golarion-Uebersicht)
    // gehoeren ins Journal, nicht auf den Spieltisch.
    .filter(({ bild }) => bild.sort === 'karte' && bild.kastenTitel === undefined)
    .map(({ bild, pfad }) => ({
      file: bild.file,
      ...(bild.name !== undefined ? { name: bild.name } : {}),
      pfad,
      breite: bild.breite,
      hoehe: bild.hoehe,
    }));

  // Personenbilder mit Namen: Traegt eines den Namen eines Statblocks, wird es
  // das Bild des Actors. Der Anhang zaehlt mit — in 8-04 steht das Portraet
  // von `Captain Ashfell Grimme` genau dort.
  const personen = bilder
    .map((bild, index) => ({ bild, pfad: pfade[index]!.pfad }))
    .filter(({ bild }) => bild.sort === 'person' && bild.name !== undefined)
    .map(({ bild, pfad }) => ({
      name: bild.name!,
      pfad,
      file: bild.file,
      anhang: bild.anhang,
    }));

  // Kreaturen brauchen den Kompendium-Index — ohne Anreicherung gibt es
  // keine geprueften Treffer, dann bleibt die Liste leer und die Vorschau
  // sagt warum.
  const fund = indizes
    ? sammleKreaturen(szenario.blocks, indizes.actors)
    : { kreaturen: [], ohneVorlage: [] };

  // Der Abgleich laedt die Vorlagen ohnehin — und liefert die angeglichenen
  // Daten gleich mit. Er muss deshalb **vor** den Plan, nicht wie frueher
  // hinterher in die Vorschau.
  const pruefung = await pruefeKreaturen(fund.kreaturen, {
    angleichen: angleichenAn(),
    werke: angleichwerkeAusSystem(),
  });

  const vorhaben = plane(szenario, {
    schema: journalNameSchema(),
    sourceHash: ergebnis.quellStreuwert,
    ...(indizes ? { actors: indizes.actors } : {}),
    bilder: pfade,
    ...(anhangTitel && anhangBilder.length > 0
      ? { anhang: { titel: anhangTitel, bilder: anhangBilder } }
      : {}),
    karten,
    ...(personen.length > 0 ? { personen } : {}),
    nscActors: nscActorsAn(),
    tokenRinge: tokenRingeAn(),
    effekte: effekteAn(),
    ...(fund.kreaturen.length > 0 ? { kreaturen: fund.kreaturen } : {}),
    ...(pruefung.daten.size > 0 ? { angleiche: pruefung.daten } : {}),
    ...(fund.ohneVorlage.length > 0 ? { ohneVorlage: fund.ohneVorlage } : {}),
    gefahrenWerke: schluesselwerkeAusSystem(),
    kreaturVerweise: kreaturVerweise(),
  });

  if (!vorhaben) {
    // Ohne Kennung haengt alles in der Luft: Ordnername, Journalname und die
    // Wiedererkennung beim naechsten Lauf.
    ui.notifications?.error(L('Welt.KeineKennung'), { permanent: true });
    return 'uebersprungen';
  }

  const inhalt = document.createElement('div');
  const liste = document.createElement('ul');
  for (const zeile of beschreibePlan(vorhaben.plan)) {
    const li = document.createElement('li');
    li.textContent = zeile;
    liste.append(li);
  }
  if (indizes) {
    const li = document.createElement('li');
    li.textContent = L('Welt.Verweise', {
      kreaturen: indizes.zaehlung.kreaturen,
      gefahren: indizes.zaehlung.gefahren,
      gegenstaende: indizes.zaehlung.gegenstaende,
      zauber: indizes.zaehlung.zauber,
      bedingungen: indizes.zaehlung.bedingungen,
    });
    liste.append(li);
  }

  {
    const li = document.createElement('li');
    li.textContent =
      wurzel === ''
        ? L('Welt.BilderOhneWurzel')
        : L('Welt.BilderZeile', {
            gesamt: bilder.length,
            karten: bilder.filter((b) => b.sort === 'karte').length,
            personen: bilder.filter((b) => b.sort === 'person').length,
            gegenstaende: bilder.filter((b) => b.sort === 'gegenstand').length,
            eingebettet: vorhaben.bilderEingebettet,
          });
    liste.append(li);
  }

  if (vorhaben.plan.szenen) {
    const s = vorhaben.plan.szenen.szenen;
    const li = document.createElement('li');
    li.textContent = L('Welt.SzenenZeile', {
      neu: s.neu.length,
      geaendert: s.aktualisiert.length,
      unveraendert: s.unveraendert.length,
    });
    liste.append(li);
    for (const name of s.entfallen) {
      const hinweis = document.createElement('li');
      hinweis.textContent = L('Welt.SzeneEntfaellt', { name });
      liste.append(hinweis);
    }
  }

  if (vorhaben.plan.kreaturen) {
    const k = vorhaben.plan.kreaturen.kreaturen;
    const li = document.createElement('li');
    // Ohne neue Kreaturen bleibt die Namensklammer leer, und in der Vorschau
    // steht „Kreaturen: 0 neu (), 4 schon in der Welt". Beim zweiten Import
    // desselben Szenarios ist das der Normalfall.
    li.textContent =
      k.neu.length === 0
        ? L('Welt.KreaturenZeileOhneNeue', { vorhanden: k.unveraendert.length })
        : L('Welt.KreaturenZeile', {
            neu: k.neu.length,
            vorhanden: k.unveraendert.length,
            namen: k.neu.join(', '),
          });
    liste.append(li);
    // Wer sein Portraet aus dem Heft bekommt. Nur die neuen — vorhandene
    // Actors werden nicht angefasst, auch ihr Bild nicht nachgetragen.
    if (k.mitBild.length > 0) {
      const bildzeile = document.createElement('li');
      bildzeile.textContent = L('Welt.KreaturenMitBild', {
        anzahl: k.mitBild.length,
        namen: k.mitBild.join(', '),
      });
      liste.append(bildzeile);
    }
    // Personen ohne Werte in einer eigenen Zeile — sie kommen aus dem Anhang,
    // nicht aus einem Kompendium.
    if (k.nscs.neu.length > 0 || k.nscs.unveraendert.length > 0) {
      const nscZeile = document.createElement('li');
      nscZeile.textContent =
        k.nscs.neu.length === 0
          ? L('Welt.NscZeileOhneNeue', { vorhanden: k.nscs.unveraendert.length })
          : L('Welt.NscZeile', {
              neu: k.nscs.neu.length,
              vorhanden: k.nscs.unveraendert.length,
              namen: k.nscs.neu.join(', '),
            });
      liste.append(nscZeile);
    }
    for (const name of k.entfallen) {
      const hinweis = document.createElement('li');
      hinweis.textContent = L('Welt.KreaturEntfaellt', { name });
      liste.append(hinweis);
    }
  }

  // Was gebaut wird, steht schon in der Kreaturenzeile. Hier bleibt nur, was
  // wirklich niemand anlegen kann.
  // Eine Vorlage aus einem Starfinder-Buch steht nur im Modul „Starfinder
  // Anachronism". Fehlt es, ist das der Grund — und der gehoert genannt,
  // sonst sucht der Spielleiter im falschen Kompendium.
  const ausStarfinder = (eintrag: OhneVorlage): boolean =>
    eintrag.buch !== undefined && /^Starfinder\b/.test(eintrag.buch);
  const modulFehlt = !anachronismAktiv();
  const niemandKannBauen = fund.ohneVorlage.filter(
    (eintrag) => eintrag.art !== 'hazard' || !eintrag.statblock,
  );
  const ohneAnachronism = niemandKannBauen
    .filter((eintrag) => modulFehlt && ausStarfinder(eintrag))
    .map((eintrag) => eintrag.name);
  const nichtAnlegbar = niemandKannBauen
    .filter((eintrag) => !(modulFehlt && ausStarfinder(eintrag)))
    .map((eintrag) => eintrag.name);
  if (ohneAnachronism.length > 0) {
    const li = document.createElement('li');
    li.textContent = L('Welt.StarfinderOhneModul', {
      modul: ANACHRONISM_MODUL,
      namen: ohneAnachronism.join(', '),
    });
    liste.append(li);
  }
  if (nichtAnlegbar.length > 0) {
    const li = document.createElement('li');
    li.textContent = L('Welt.KreaturenOhneVorlage', { namen: nichtAnlegbar.join(', ') });
    liste.append(li);
  }

  const gebauteGefahren = fund.ohneVorlage
    .filter((eintrag) => eintrag.art === 'hazard' && eintrag.statblock)
    .map((eintrag) => eintrag.name);
  if (gebauteGefahren.length > 0) {
    const li = document.createElement('li');
    li.textContent = L('Welt.GefahrenGebaut', {
      anzahl: gebauteGefahren.length,
      namen: gebauteGefahren.join(', '),
    });
    liste.append(li);
    // Was der Statblock hergab, aber in kein Feld passte. Verschwiegen waere
    // es besonders heimtueckisch: Die Gefahr entstuende trotzdem und saehe
    // richtig aus.
    for (const rest of vorhaben.gefahrenReste) {
      const hinweis = document.createElement('li');
      hinweis.textContent = L('Welt.GefahrRest', { punkt: rest });
      liste.append(hinweis);
    }
  }

  // Wo das Heft von seiner Vorlage abweicht, legt der Import trotzdem die
  // unveraenderte Kopie an. Das steht hier, damit es niemanden ueberrascht —
  // geaendert wird noch nichts.
  for (const kreatur of pruefung.berichte) {
    const li = document.createElement('li');
    // Eine einzelne Abweichung bekommt einen eigenen Satz. Foundrys `format`
    // kann keine Mehrzahl bilden, und „weicht in 1 Punkten ab" stand am
    // 14.08.2026 im Screenshot der Testinstanz.
    //
    // Beide Aufrufe stehen ausgeschrieben, statt den Schluessel mit einem
    // Fragezeichen zu waehlen: Sonst sieht `tools/pruefe.mjs` keinen von
    // beiden mehr und haelt sie fuer unbenutzt.
    li.textContent =
      kreatur.abweichungen.length === 1
        ? L('Welt.KreaturWeichtAbEins', { name: kreatur.name, vorlage: kreatur.vorlage })
        : L('Welt.KreaturWeichtAb', {
            name: kreatur.name,
            vorlage: kreatur.vorlage,
            anzahl: kreatur.abweichungen.length,
          });
    const unterliste = document.createElement('ul');
    for (const abweichung of kreatur.abweichungen) {
      const zeile = document.createElement('li');
      zeile.textContent = L('Welt.Abweichung', {
        feld: feldName(abweichung.feld),
        heft: abweichung.heft,
        vorlage: abweichung.vorlage,
      });
      unterliste.append(zeile);
    }
    // Was gemeldet, aber nicht angewendet werden konnte. Ohne diese Zeile
    // klaffte eine stille Luecke zwischen Bericht und Ergebnis.
    for (const punkt of kreatur.ungenutzt ?? []) {
      const zeile = document.createElement('li');
      zeile.textContent = L('Welt.AngleichRest', { punkt });
      unterliste.append(zeile);
    }
    li.append(unterliste);
    liste.append(li);
  }

  if (vorhaben.plan.effekte) {
    const e = vorhaben.plan.effekte.effekte;
    const li = document.createElement('li');
    li.textContent = L('Welt.EffekteZeile', {
      neu: e.neu.length,
      vorhanden: e.unveraendert.length,
      verlinkt: vorhaben.effekteVerlinkt,
    });
    liste.append(li);
    for (const name of e.neu) {
      const zeile = document.createElement('li');
      zeile.textContent = L('Welt.Effekt', { name });
      liste.append(zeile);
    }
  }

  if (vorhaben.plan.anhang) {
    const li = document.createElement('li');
    li.textContent = L(
      vorhaben.plan.anhang.journal.art === 'anlegen'
        ? 'Welt.AnhangAnlegen'
        : 'Welt.AnhangAktualisieren',
      {
        name:
          vorhaben.plan.anhang.journal.art === 'anlegen'
            ? vorhaben.plan.anhang.journal.name
            : vorhaben.plan.anhang.journal.alterName,
        seiten: vorhaben.wunsch.anhang?.seiten.length ?? 0,
      },
    );
    liste.append(li);
  }

  if (vorhaben.plan.handouts) {
    const li = document.createElement('li');
    li.textContent = L(
      vorhaben.plan.handouts.journal.art === 'anlegen'
        ? 'Welt.HandoutsAnlegen'
        : 'Welt.HandoutsAktualisieren',
      {
        name:
          vorhaben.plan.handouts.journal.art === 'anlegen'
            ? vorhaben.plan.handouts.journal.name
            : vorhaben.plan.handouts.journal.alterName,
        seiten: vorhaben.wunsch.handouts?.seiten.length ?? 0,
      },
    );
    liste.append(li);
    for (const seite of vorhaben.wunsch.handouts?.seiten ?? []) {
      const zeile = document.createElement('li');
      zeile.textContent = L('Welt.Handout', { name: seite.name });
      liste.append(zeile);
    }
  }

  inhalt.append(liste);

  if (vorhaben.plan.journal.art === 'aktualisieren') {
    const hinweis = document.createElement('p');
    hinweis.className = 'notification info';
    hinweis.textContent = L('Welt.HinweisAktualisieren');
    inhalt.append(hinweis);
  }

  const antwort = await foundry.applications.api.DialogV2.wait({
    window: {
      title: stapel
        ? L('Welt.TitelStapel', {
            nummer: stapel.nummer,
            gesamt: stapel.gesamt,
            name: ergebnis.szenario.title,
          })
        : L('Welt.Titel'),
    },
    content: inhalt,
    buttons: [
      {
        action: 'schreiben',
        label:
          vorhaben.plan.journal.art === 'anlegen' ? L('Welt.Anlegen') : L('Welt.Aktualisieren'),
        icon: 'fa-solid fa-book',
        default: true,
      },
      { action: 'abbrechen', label: L('Welt.Abbrechen'), icon: 'fa-solid fa-xmark' },
      ...(stapel
        ? [
            {
              action: 'alle-abbrechen',
              label: L('Welt.AlleAbbrechen'),
              icon: 'fa-solid fa-ban',
            },
          ]
        : []),
    ],
    rejectClose: false,
  });

  if (antwort === 'alle-abbrechen') return 'abgebrochen';
  if (antwort !== 'schreiben') return 'uebersprungen';

  try {
    // Erst die Bilder, dann das Journal: sobald die Seiten in der Welt sind,
    // zeigen ihre `<figure>`-Elemente auf die Pfade — die Dateien muessen dann
    // schon liegen.
    await ladeBilderHoch(bilder, pfade);

    const geschrieben = await schreibe(vorhaben, version);
    ui.notifications?.info(
      L('Welt.Fertig', {
        name: vorhaben.wunsch.journalName,
        neu: geschrieben.seitenNeu,
        geaendert: geschrieben.seitenAktualisiert,
        entfallen: geschrieben.seitenEntfallen,
      }),
    );
    // Im Stapel bleibt das Journal zu: vier aufgeschlagene Blaetter
    // uebereinander helfen niemandem.
    if (!stapel) game.journal?.get(geschrieben.journalId)?.sheet?.render(true);
    return 'geschrieben';
  } catch (fehler) {
    console.error('pfs-scenario-tools | Schreiben fehlgeschlagen', fehler);
    ui.notifications?.error(L('Welt.Fehlgeschlagen', { fehler: String(fehler) }), {
      permanent: true,
    });
    return 'uebersprungen';
  }
}

/**
 * Der Bilderlauf mit Fortschrittsbalken.
 *
 * Schlaegt er fehl, laeuft der Import ohne Bilder weiter — ein kaputtes Bild
 * soll das Journal nicht aufhalten. Ohne Bildwurzel oder ohne Kennung wird er
 * gar nicht erst gestartet; die Vorschau sagt dann warum.
 */
async function sammleBilder(
  ergebnis: Leseergebnis,
  wurzel: string,
): Promise<{ bilder: GelesenesBild[]; pfade: BildFuerSeiten[]; anhangTitel?: string }> {
  const designation = ergebnis.szenario.designation;
  if (wurzel === '' || !designation) return { bilder: [], pfade: [] };

  const meldung = ui.notifications?.info(L('Welt.BilderSammeln'), {
    permanent: true,
    progress: true,
    console: false,
  });

  try {
    const { bilder, anhangTitel } = await bilderAusBytes(ergebnis.bytes, ergebnis.szenario, {
      fortschritt: (seite, von) => {
        meldung?.update({ message: L('Welt.BilderSeite', { seite, von }), pct: seite / von });
      },
    });
    meldung?.remove();

    const schluessel = scenarioKey(designation);
    const pfade = bilder.map((bild) => ({
      pfad: bildPfad(wurzel, schluessel, bild.file, bild.endung),
      ...(bild.caption !== undefined ? { caption: bild.caption } : {}),
      ...(bild.kastenTitel !== undefined ? { kastenTitel: bild.kastenTitel } : {}),
    }));

    return { bilder, pfade, ...(anhangTitel ? { anhangTitel } : {}) };
  } catch (fehler) {
    meldung?.remove();
    console.error('pfs-scenario-tools | Bilderlauf fehlgeschlagen', fehler);
    ui.notifications?.warn(L('Welt.BilderFehlgeschlagen', { fehler: String(fehler) }), {
      permanent: true,
    });
    return { bilder: [], pfade: [] };
  }
}

/** Laedt die kodierten Bilder an ihre geplanten Pfade, mit Fortschrittsbalken. */
async function ladeBilderHoch(bilder: GelesenesBild[], pfade: BildFuerSeiten[]): Promise<void> {
  if (bilder.length === 0) return;

  const meldung = ui.notifications?.info(L('Welt.BilderHochladen', { nr: 1, von: bilder.length }), {
    permanent: true,
    progress: true,
    console: false,
  });

  try {
    const ordner = new Set(pfade.map((eintrag) => bildOrdner(eintrag.pfad)));
    for (const pfad of ordner) await stelleOrdnerSicher(pfad);

    for (let i = 0; i < bilder.length; i++) {
      meldung?.update({
        message: L('Welt.BilderHochladen', { nr: i + 1, von: bilder.length }),
        pct: i / bilder.length,
      });
      const bild = bilder[i]!;
      await ladeHoch(bildOrdner(pfade[i]!.pfad), `${bild.file}.${bild.endung}`, bild.blob);
    }
  } finally {
    meldung?.remove();
  }
}
