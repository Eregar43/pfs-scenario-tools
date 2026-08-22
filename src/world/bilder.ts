/**
 * Bringt die extrahierten Bilder in die Seiten des Journals.
 *
 * Reine Daten, kein Foundry-Aufruf: Wo ein Bild im HTML landet und unter
 * welchem Pfad es liegt, ist eine Entscheidung — und Entscheidungen sind hier
 * ohne Attrappen pruefbar, wie in `plan.ts`.
 *
 * Eingebettet wird an den Bildunterschriften: `blockHtml` hat sie als
 * `<!-- Bildunterschrift: ... -->` in den Seiten hinterlassen, und genau
 * diese Kommentare werden durch `<figure>`-Elemente ersetzt. Bilder ohne
 * Unterschrift (vor allem die Karten) werden nur abgelegt — sie bekommen in
 * Etappe 4 ihre Szene.
 */
import { escapeHtml } from '../pdf/journal.ts';
import type { SeitenAbbild } from './plan.ts';

/** Was die Einbettung von einem Bild wissen muss; die Bytes gehen sie nichts an. */
export interface BildFuerSeiten {
  pfad: string;
  caption?: string;
  /** Titel des Kastens, in den das Bild gehoert — statt einer Unterschrift. */
  kastenTitel?: string;
}

/** Ein benanntes Personenbild, so viel wie die Zuordnung zum Actor braucht. */
export interface PersonenBild {
  /** Der Anzeigename aus `imagenames.ts` — die Unterschrift oder Ueberschrift. */
  name: string;
  pfad: string;
  /** Dateiname ohne Endung; daran haengt die Bildseite im Spielhilfen-Journal. */
  file?: string;
  /** Steht das Bild im Spielhilfen-Anhang? Nur von dort entstehen NSC-Actors. */
  anhang?: boolean;
}

/**
 * Der Ordnername eines Szenarios unter der Bildwurzel: `pfs_s08_01`.
 *
 * Der Schluessel kommt **gepaddet** (`08-01`) — wie in den Flags, nicht wie
 * im Ordnernamen der Journale: Dateipfade sollen stabil sortieren. Das
 * `pfs_s`-Praefix und der Unterstrich folgen dem Ablageschema des Autors.
 */
export function szenarioBildOrdner(schluessel: string): string {
  return `pfs_s${schluessel.replace('-', '_')}`;
}

/**
 * Der Ablagepfad eines Bildes unterhalb der gewaehlten Bildwurzel.
 *
 * Alle Bilder eines Szenarios liegen in **einem** Verzeichnis. Die fruehere
 * Aufteilung nach Sorten (`karten/`, `personen/`, `gegenstaende/`) war eher
 * irrefuehrend als hilfreich — die Sortenerkennung ist eine Heuristik, und
 * so viele Dateien sind es je Heft nicht. Die Dublettenzaehlung der Namen
 * laeuft dafuer ueber alle Sorten gemeinsam.
 */
export function bildPfad(
  wurzel: string,
  schluessel: string,
  file: string,
  endung: string,
): string {
  const stamm = wurzel.replace(/\/+$/, '');
  return `${stamm}/${szenarioBildOrdner(schluessel)}/${file}.${endung}`;
}

/** Der Ordneranteil eines mit `bildPfad` gebauten Pfads. */
export function bildOrdner(pfad: string): string {
  return pfad.slice(0, pfad.lastIndexOf('/'));
}

function figureHtml(pfad: string, caption?: string): string {
  const alt = escapeHtml(caption ?? '').replace(/"/g, '&quot;');
  const img = `<img src="${pfad}" alt="${alt}">`;
  return caption
    ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
    : `<figure>${img}</figure>`;
}

/**
 * Auf den Wortlaut gebracht, wie ihn ein Mensch vergleicht: ohne Markup,
 * mit einfachen Leerzeichen, ohne Gross und Klein.
 *
 * Noetig, weil der Kastentitel aus dem Blockstrom (`WHERE ON GOLARION?`)
 * und die Titelzeile im HTML (`Where on Golarion?`, per Titelschreibung
 * gesetzt und maskiert) nicht zeichengleich sind.
 */
export function vergleichsform(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Vorsilben, die die Kopfzeile des Hefts vor den Vorlagennamen setzt.
 *
 * Der Actor heisst wie der Statblock (`Weak Bodyguard`), das Bild im Anhang
 * aber wie die Person (`Bodyguard`). Ohne diesen Rueckfall faende eine
 * angepasste Fassung ihr eigenes Portraet nicht.
 */
const ANPASSUNG = /^(?:elite|weak)\s+/;

/**
 * Das Bild aus dem Heft, das zu diesem Actor gehoert — oder keines.
 *
 * Die Regel ist absichtlich eng: **Namensgleichheit**, nichts weiter. Sie
 * traegt, weil beide Namen aus demselben Heft stammen — die Kopfzeile des
 * Statblocks und die Bildunterschrift derselben Person. An der Season 8
 * belegt: `Captain Ashfell Grimme` (8-04), `Poppet Mage` (8-01), `Twigjack`
 * (8-02), `Wenna Lafonte` und `Wight` (8-03).
 *
 * Weiter zu gehen — Mehrzahl abschneiden, Teilzeichenketten suchen — waere
 * geraten. Ein falsches Portraet am Actor ist schlimmer als gar keines: Es
 * faellt erst am Spieltisch auf.
 */
export function bildFuerKreatur(name: string, bilder: PersonenBild[]): string | undefined {
  const gesucht = vergleichsform(name);
  const treffer = bilder.find((bild) => vergleichsform(bild.name) === gesucht);
  if (treffer) return treffer.pfad;

  const ohneVorsilbe = gesucht.replace(ANPASSUNG, '');
  if (ohneVorsilbe === gesucht) return undefined;
  return bilder.find((bild) => vergleichsform(bild.name) === ohneVorsilbe)?.pfad;
}

/**
 * Wird das Portraet aus dem Heft auch das Token — und bekommt es einen Ring?
 *
 * Die Regel steht hier und nicht in `apply.ts`, weil sie eine Entscheidung
 * ist. Sie hat drei Teile:
 *
 * 1. **Ohne Portraet bleibt alles, wie es ist.** Dann steckte im Ring nur das
 *    graue Standardsymbol des Systems.
 * 2. **Gefahren bekommen keinen Ring.** Ein Ring gehoert um ein Gesicht; eine
 *    einstuerzende Empore hat keins.
 * 3. **Das Portraet schlaegt das mitgebrachte Token der Vorlage.** Das ist
 *    Absicht und ausdrueckliche Entscheidung des Autors: Die Figur ist
 *    im Heft ein Mann, das Kompendium-Token zeigt eine Piratin. Ein
 *    unpassendes Token ist schlechter als ein Portraet.
 *
 * Zurueck kommt `undefined`, wenn nichts zu tun ist.
 */
export function tokenAusPortraet(
  art: 'creature' | 'hazard' | 'nsc',
  bild: string | undefined,
  ringe: boolean,
): { bild: string; ring: boolean } | undefined {
  if (bild === undefined || bild === '' || art === 'hazard') return undefined;
  return { bild, ring: ringe };
}

/** Was `tokenAbschnitt` von einer gewuenschten Kreatur braucht. */
export interface TokenWunsch {
  name: string;
  /** Portraet fuer `actor.img`. */
  bild?: string;
  /** Portraet, das auch das Token werden soll. */
  tokenBild?: string;
  ring?: boolean;
}

/**
 * Baut den `prototypeToken`-Abschnitt eines neuen Actors.
 *
 * Steht hier und nicht in `apply.ts`, weil hier gepruefte Entscheidungen
 * hingehoeren — und weil genau an dieser Stelle schon ein Fehler gesessen hat
 * (siehe unten). `apply.ts` reicht nur die Vorlage und den Standardwert
 * herein, die es aus Foundry holt.
 *
 * Drei Dinge passieren:
 *
 * 1. **Der Name** ist immer der des Statblocks.
 * 2. **Das Bild.** Entweder unser Portraet (dann faellt der Zoom der Vorlage
 *    weg — das Token-Modul setzt 2, abgestimmt auf sein eigenes Bild), oder
 *    der festgenagelte Standardwert, damit unser `img` das Token nicht
 *    mitzieht.
 * 3. **Der Ring.** Sein **Motiv** muss ausdruecklich geraeumt werden: Haengt
 *    am Kompendium ein Token-Modul (`pf2e-tokens-npc-core`), traegt die
 *    Vorlage bereits ein `ring.subject.texture`. PF2e mischt das beim Lesen
 *    aus dem Kompendium ein, `toObject()` nimmt es mit, und der Ring zeigt
 *    dann dieses Motiv statt unseres Portraets. Bei `Captain Ashfell
 *    Grimme` blieb so die Piratin stehen, obwohl das Token-Bild richtig
 *    gesetzt war (15.08.2026). Leer faellt Foundry auf das Token-Bild
 *    zurueck — `null`, nicht `''`, denn das Feld ist ein FilePathField.
 */
export function tokenAbschnitt(
  kreatur: TokenWunsch,
  vorlage: Record<string, unknown> | undefined,
  standardBild: string | undefined,
): Record<string, unknown> {
  const textur = vorlage?.['texture'] as Record<string, unknown> | undefined;
  const ring = vorlage?.['ring'] as Record<string, unknown> | undefined;
  const quelle = kreatur.tokenBild ?? standardBild;

  return {
    ...vorlage,
    name: kreatur.name,
    ...(quelle
      ? {
          texture: {
            ...textur,
            src: quelle,
            ...(kreatur.tokenBild ? { scaleX: 1, scaleY: 1 } : {}),
          },
        }
      : {}),
    ...(kreatur.tokenBild
      ? {
          ring: {
            ...ring,
            enabled: kreatur.ring === true,
            subject: { texture: null, scale: 1 },
          },
        }
      : {}),
  };
}

/**
 * Titelzeilen der Kaesten, wie das Journal sie setzt. Die Ebene variiert —
 * ein Sidebar-Titel ist ein `h1`, ein Eintrag im Fliesstext ein `h3` —
 * deshalb die Rueckreferenz statt einer festen Ziffer.
 */
const KASTEN_TITEL = /<h(\d) class="no-toc">(.*?)<\/h\1>/g;

/**
 * Setzt ein Bild in den Kasten mit diesem Titel — direkt nach dessen
 * Titelzeile. Ohne Treffer bleibt alles unveraendert; das Bild ist dann nur
 * abgelegt.
 */
function fuegeInKastenEin(seiten: SeitenAbbild[], pfad: string, titel: string): boolean {
  const gesucht = vergleichsform(titel);

  for (const seite of seiten) {
    for (const treffer of seite.inhalt.matchAll(KASTEN_TITEL)) {
      if (vergleichsform(treffer[2]!) !== gesucht) continue;
      const at = treffer.index! + treffer[0].length;
      seite.inhalt =
        seite.inhalt.slice(0, at) + '\n' + figureHtml(pfad) + seite.inhalt.slice(at);
      return true;
    }
  }

  return false;
}

/**
 * Ersetzt die Bildunterschrift-Kommentare durch `<figure>`-Elemente.
 *
 * Veraendert die Seiten an Ort und Stelle — sie sind zu diesem Zeitpunkt
 * frisch gebaut und noch mit niemandem verglichen. Jeder Kommentar wird
 * hoechstens einmal ersetzt; was danach an Kommentaren uebrig bleibt, sind
 * Unterschriften, zu deren Bild keine Datei entstand. Sie bleiben stehen —
 * Foundry wirft sie beim Speichern ohnehin hinaus.
 *
 * Zurueck kommt die Zahl der eingebetteten Bilder, fuer die Vorschau.
 */
export function fuegeFigurenEin(seiten: SeitenAbbild[], bilder: BildFuerSeiten[]): number {
  let eingebettet = 0;

  for (const bild of bilder) {
    if (bild.caption) {
      const kommentar = `<!-- Bildunterschrift: ${escapeHtml(bild.caption)} -->`;

      for (const seite of seiten) {
        const at = seite.inhalt.indexOf(kommentar);
        if (at === -1) continue;
        seite.inhalt =
          seite.inhalt.slice(0, at) +
          figureHtml(bild.pfad, bild.caption) +
          seite.inhalt.slice(at + kommentar.length);
        eingebettet++;
        break;
      }
      continue;
    }

    // Ohne Unterschrift, aber mit Kasten: das Bild gehoert in den Kasten,
    // aus dessen Titel sein Name stammt — ohne figcaption, der Kastentitel
    // steht ja direkt darueber.
    if (bild.kastenTitel && fuegeInKastenEin(seiten, bild.pfad, bild.kastenTitel)) {
      eingebettet++;
    }
  }

  return eingebettet;
}
