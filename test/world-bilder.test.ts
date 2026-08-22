import { describe, expect, it } from 'vitest';
import {
  bildFuerKreatur,
  tokenAbschnitt,
  tokenAusPortraet,
  bildOrdner,
  bildPfad,
  fuegeFigurenEin,
  szenarioBildOrdner,
} from '../src/world/bilder.ts';
import type { SeitenAbbild } from '../src/world/plan.ts';

function seite(inhalt: string): SeitenAbbild {
  return { id: 'a1b2c3d4e5f6a7b8', name: 'Seite', inhalt };
}

describe('szenarioBildOrdner', () => {
  it('formt den Schluessel in das Ablageschema des Autors um', () => {
    expect(szenarioBildOrdner('08-01')).toBe('pfs_s08_01');
    expect(szenarioBildOrdner('10-14')).toBe('pfs_s10_14');
  });
});

describe('bildPfad', () => {
  it('legt alle Bilder eines Szenarios in ein Verzeichnis', () => {
    expect(bildPfad('assets/pfs', '08-01', 'danbry', 'webp')).toBe(
      'assets/pfs/pfs_s08_01/danbry.webp',
    );
    expect(bildPfad('assets/pfs', '08-01', 'karrenholt', 'webp')).toBe(
      'assets/pfs/pfs_s08_01/karrenholt.webp',
    );
  });

  it('vertraegt eine Wurzel mit Schlusstrich', () => {
    // Der FilePicker liefert den Pfad mal mit, mal ohne Schlusstrich.
    expect(bildPfad('assets/pfs/', '08-01', 'locust-dagger', 'png')).toBe(
      'assets/pfs/pfs_s08_01/locust-dagger.png',
    );
  });
});

describe('bildOrdner', () => {
  it('nimmt den Ordneranteil des Pfads', () => {
    expect(bildOrdner('assets/pfs/pfs_s08_01/danbry.webp')).toBe('assets/pfs/pfs_s08_01');
  });
});

describe('fuegeFigurenEin', () => {
  it('ersetzt den Kommentar durch ein figure-Element', () => {
    const seiten = [seite('<p>Text</p>\n<!-- Bildunterschrift: Danbry -->\n<p>weiter</p>')];
    const anzahl = fuegeFigurenEin(seiten, [
      { pfad: 'assets/pfs/08-01/personen/danbry.webp', caption: 'Danbry' },
    ]);

    expect(anzahl).toBe(1);
    expect(seiten[0]!.inhalt).toBe(
      '<p>Text</p>\n<figure><img src="assets/pfs/08-01/personen/danbry.webp" alt="Danbry"><figcaption>Danbry</figcaption></figure>\n<p>weiter</p>',
    );
  });

  it('findet den Kommentar auch bei Sonderzeichen in der Unterschrift', () => {
    // `blockHtml` schreibt die Unterschrift HTML-maskiert in den Kommentar —
    // die Suche muss dieselbe Maskierung anwenden, sonst geht sie leer aus.
    const seiten = [seite('<!-- Bildunterschrift: Ingrit &amp; Tagheema -->')];
    const anzahl = fuegeFigurenEin(seiten, [
      { pfad: 'p.webp', caption: 'Ingrit & Tagheema' },
    ]);

    expect(anzahl).toBe(1);
    expect(seiten[0]!.inhalt).toContain('<figcaption>Ingrit &amp; Tagheema</figcaption>');
  });

  it('laesst Bilder ohne Unterschrift aus und Seiten ohne Treffer stehen', () => {
    const seiten = [seite('<p>Nur Text</p>')];
    const anzahl = fuegeFigurenEin(seiten, [
      { pfad: 'karte.webp' },
      { pfad: 'figur.webp', caption: 'Niemand' },
    ]);

    expect(anzahl).toBe(0);
    expect(seiten[0]!.inhalt).toBe('<p>Nur Text</p>');
  });

  it('setzt ein Bild mit Kastentitel in seinen Kasten', () => {
    // Die Inselkarte gehoert in `WHERE ON GOLARION?`. Der Titel steht im
    // HTML in Titelschreibung und als h1 (Sidebar-Titel) — der Vergleich
    // muss ueber Schreibung wie Ebene hinwegsehen.
    const seiten = [
      seite(
        '<aside class="sidebar float-right">\n  <h1 class="no-toc">Where On Golarion?</h1>\n<p>Text im Kasten</p>\n</aside>',
      ),
    ];
    const anzahl = fuegeFigurenEin(seiten, [
      { pfad: 'karte.webp', kastenTitel: 'WHERE ON GOLARION?' },
    ]);

    expect(anzahl).toBe(1);
    expect(seiten[0]!.inhalt).toBe(
      '<aside class="sidebar float-right">\n  <h1 class="no-toc">Where On Golarion?</h1>\n<figure><img src="karte.webp" alt=""></figure>\n<p>Text im Kasten</p>\n</aside>',
    );
  });

  it('laesst ein Kastenbild ohne passenden Kasten unangetastet', () => {
    const seiten = [seite('<p>Kein Kasten weit und breit</p>')];
    expect(fuegeFigurenEin(seiten, [{ pfad: 'k.webp', kastenTitel: 'Anderswo' }])).toBe(0);
    expect(seiten[0]!.inhalt).toBe('<p>Kein Kasten weit und breit</p>');
  });

  it('ersetzt jeden Kommentar hoechstens einmal', () => {
    // Zwei Bilder mit derselben Unterschrift: das zweite geht leer aus,
    // statt denselben Kommentar doppelt zu ersetzen.
    const seiten = [seite('<!-- Bildunterschrift: Teritha -->')];
    const anzahl = fuegeFigurenEin(seiten, [
      { pfad: 'a.webp', caption: 'Teritha' },
      { pfad: 'b.webp', caption: 'Teritha' },
    ]);

    expect(anzahl).toBe(1);
    expect(seiten[0]!.inhalt).toContain('a.webp');
    expect(seiten[0]!.inhalt).not.toContain('b.webp');
  });
});

describe('bildFuerKreatur', () => {
  // Die Namen stammen aus den Heften der Season 8 — dieselbe Schreibung, die
  // `imagenames.ts` aus Unterschrift und Ueberschrift gewinnt.
  const bilder = [
    { name: 'Captain Ashfell Grimme', pfad: 'pfs/pfs_s08_04/captain-ashfell-grimme.webp' },
    { name: 'Wenna Lafonte', pfad: 'pfs/pfs_s08_03/wenna-lafonte.webp' },
    { name: 'Bodyguard', pfad: 'pfs/pfs_s08_03/bodyguard.webp' },
  ];

  it('findet das Bild mit demselben Namen', () => {
    expect(bildFuerKreatur('Wenna Lafonte', bilder)).toBe('pfs/pfs_s08_03/wenna-lafonte.webp');
  });

  it('vergleicht ohne Gross- und Kleinschreibung und ohne doppelte Leerzeichen', () => {
    expect(bildFuerKreatur('captain  ashfell grimme', bilder)).toBe(
      'pfs/pfs_s08_04/captain-ashfell-grimme.webp',
    );
  });

  it('faellt bei Elite und Schwach auf den Namen der Vorlage zurueck', () => {
    // Der Actor heisst wie der Statblock, das Bild wie die Person.
    expect(bildFuerKreatur('Weak Bodyguard', bilder)).toBe('pfs/pfs_s08_03/bodyguard.webp');
    expect(bildFuerKreatur('Elite Bodyguard', bilder)).toBe('pfs/pfs_s08_03/bodyguard.webp');
  });

  it('bleibt ohne Treffer leer, statt das naechstbeste Bild zu nehmen', () => {
    expect(bildFuerKreatur('Twigjack', bilder)).toBeUndefined();
    // Teiltreffer zaehlen nicht: `Wenna` ist nicht `Wenna Lafonte`.
    expect(bildFuerKreatur('Wenna', bilder)).toBeUndefined();
    // Und die Vorsilbe erfindet keinen Treffer, den es ohne sie nicht gaebe.
    expect(bildFuerKreatur('Elite Twigjack', bilder)).toBeUndefined();
  });

  it('nimmt das erste Bild, wenn zwei denselben Namen tragen', () => {
    const doppelt = [
      { name: 'Wight', pfad: 'pfs/pfs_s08_03/wight.webp' },
      { name: 'Wight', pfad: 'pfs/pfs_s08_03/wight-2.webp' },
    ];
    expect(bildFuerKreatur('Wight', doppelt)).toBe('pfs/pfs_s08_03/wight.webp');
  });
});

describe('tokenAusPortraet', () => {
  const bild = 'pfs/pfs_s08_04/captain-ashfell-grimme.webp';

  it('macht das Portraet zum Token und gibt ihm einen Ring', () => {
    expect(tokenAusPortraet('creature', bild, true)).toEqual({ bild, ring: true });
    expect(tokenAusPortraet('nsc', bild, true)).toEqual({ bild, ring: true });
  });

  it('tauscht das Bild auch ohne Ring', () => {
    // Der Ring ist die Verzierung, der Bildtausch der Zweck: Das
    // Kompendium-Token von Captain Ashfell zeigt eine Piratin.
    expect(tokenAusPortraet('creature', bild, false)).toEqual({ bild, ring: false });
  });

  it('laesst Gefahren in Ruhe', () => {
    // Ein Ring gehoert um ein Gesicht. Eine einstuerzende Empore hat keins.
    expect(tokenAusPortraet('hazard', bild, true)).toBeUndefined();
  });

  it('tut nichts ohne Portraet', () => {
    // Sonst steckte im Ring nur das graue Standardsymbol des Systems.
    expect(tokenAusPortraet('creature', undefined, true)).toBeUndefined();
    expect(tokenAusPortraet('nsc', '', true)).toBeUndefined();
  });
});

describe('tokenAbschnitt', () => {
  /**
   * Die Vorlage, wie sie aus dem Kompendium kommt, wenn daran ein Token-Modul
   * haengt: eigenes Tokenbild, eigener Zoom, eigenes Motiv im Ring. Werte aus
   * `Captain Ashfell Grimme` in der laufenden Instanz.
   */
  const vorlage = {
    name: 'Pirate',
    texture: {
      src: 'modules/pf2e-tokens-npc-core/assets/tokens/pirate.webp',
      scaleX: 2,
      scaleY: 2,
      anchorX: 0.5,
      anchorY: 0.5,
      fit: 'contain',
    },
    ring: {
      enabled: true,
      subject: { texture: 'modules/pf2e-tokens-npc-core/assets/subjects/pirate.webp', scale: 2 },
      colors: { ring: null, background: null },
    },
    actorLink: false,
  };

  const wunsch = {
    name: 'Captain Ashfell Grimme',
    bild: 'pfs/pfs_s08_04/captain-ashfell-grimme.webp',
    tokenBild: 'pfs/pfs_s08_04/captain-ashfell-grimme.webp',
    ring: true,
  };

  it('raeumt das Motiv der Vorlage aus dem Ring', () => {
    // Der Fehler vom 15.08.2026: Das Tokenbild sass richtig, im Ring stand
    // aber weiter die Piratin des Token-Moduls.
    const token = tokenAbschnitt(wunsch, vorlage, undefined);
    const ring = token.ring as { enabled: boolean; subject: { texture: null; scale: number } };

    expect(ring.subject.texture).toBeNull();
    expect(ring.subject.scale).toBe(1);
    expect(ring.enabled).toBe(true);
  });

  it('setzt unser Portraet als Tokenbild und wirft den Zoom der Vorlage weg', () => {
    const textur = tokenAbschnitt(wunsch, vorlage, undefined).texture as Record<string, unknown>;

    expect(textur.src).toBe('pfs/pfs_s08_04/captain-ashfell-grimme.webp');
    expect(textur.scaleX).toBe(1);
    expect(textur.scaleY).toBe(1);
    // Was die Vorlage sonst mitbringt, bleibt stehen.
    expect(textur.fit).toBe('contain');
  });

  it('schaltet den Ring ab, wenn die Einstellung aus ist — raeumt aber trotzdem', () => {
    const token = tokenAbschnitt({ ...wunsch, ring: false }, vorlage, undefined);
    const ring = token.ring as { enabled: boolean; subject: { texture: null } };

    expect(ring.enabled).toBe(false);
    expect(ring.subject.texture).toBeNull();
    expect((token.texture as { src: string }).src).toBe(wunsch.tokenBild);
  });

  it('nagelt ohne eigenes Portraet nur den Standardwert fest', () => {
    // Der Fall einer Gefahr mit passendem Bild: `img` wird gesetzt, das Token
    // darf es aber nicht mitziehen. Am Ring wird dabei nichts angefasst.
    const token = tokenAbschnitt(
      { name: 'Aeon Consumption', bild: 'pfs/pfs_s08_01/aeon.webp' },
      vorlage,
      'systems/pf2e/icons/default-icons/hazard.svg',
    );

    expect((token.texture as { src: string }).src).toBe(
      'systems/pf2e/icons/default-icons/hazard.svg',
    );
    // Kein Zoom-Eingriff, kein Ring-Eingriff.
    expect((token.texture as { scaleX: number }).scaleX).toBe(2);
    expect(token.ring).toEqual(vorlage.ring);
  });

  it('laesst die Vorlage in Ruhe, wenn es nichts zu tun gibt', () => {
    const token = tokenAbschnitt({ name: 'Twigjack' }, vorlage, undefined);

    expect(token.texture).toEqual(vorlage.texture);
    expect(token.ring).toEqual(vorlage.ring);
    expect(token.name).toBe('Twigjack');
    expect(token.actorLink).toBe(false);
  });
});
