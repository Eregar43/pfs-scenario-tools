import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KARTEN_EINSTELLUNGEN } from '../src/world/karten-einstellungen.ts';
import { kartenWaende } from '../src/world/waende.ts';
import {
  EXPORT_FELDER,
  kartenkennungAusPfad,
  quelltextzeilen,
  skalierungAus,
  wandBezeichner,
  wandauszug,
  wanddateiText,
} from '../src/world/kartenexport.ts';

// `readFileSync` ist in `test/node-shim.d.ts` eingetippt; dieses Repo fuehrt
// keine Node-Typen. Die Begruendung steht dort.

/** Eine Wand, wie `WallDocument#toObject()` sie liefert. */
function wand(werte: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    _id: 'AbCdEfGhIjKlMnOp',
    c: [0, 0, 100, 0],
    move: 20,
    sight: 20,
    sound: 20,
    light: 20,
    dir: 0,
    door: 0,
    ds: 0,
    threshold: { light: null, sight: null, sound: null, attenuation: false },
    animation: {},
    flags: { levels: { rangeTop: 10 } },
    ...werte,
  };
}

describe('wandauszug', () => {
  it('behaelt genau die Exportfelder, in ihrer Reihenfolge', () => {
    const { waende } = wandauszug([wand()]);
    expect(waende).toHaveLength(1);
    expect(Object.keys(waende[0]!)).toEqual([...EXPORT_FELDER]);
  });

  it('laesst Id und Fremd-Flags draussen', () => {
    const { waende } = wandauszug([wand()]);
    expect(waende[0]).not.toHaveProperty('_id');
    expect(waende[0]).not.toHaveProperty('flags');
  });

  it('ueberspringt deckungsgleiche Doppel und zaehlt sie', () => {
    // Zwei Waende, die sich nur in der Id unterscheiden — die Altlast des
    // Verdopplungs-Fehlers vom 13.08.2026.
    const auszug = wandauszug([wand(), wand({ _id: 'ZzYyXxWwVvUuTtSs' })]);
    expect(auszug.waende).toHaveLength(1);
    expect(auszug.doppel).toBe(1);
  });

  it('haelt Waende auseinander, die sich in einem Exportfeld unterscheiden', () => {
    const auszug = wandauszug([wand(), wand({ door: 1 })]);
    expect(auszug.waende).toHaveLength(2);
    expect(auszug.doppel).toBe(0);
  });

  it('zaehlt Geheimtueren mit', () => {
    const auszug = wandauszug([wand(), wand({ door: 1, c: [0, 0, 50, 0] }), wand({ door: 2, c: [0, 0, 60, 0] })]);
    expect(auszug.tueren).toBe(2);
  });

  it('laesst Waende ohne brauchbare Koordinaten aus', () => {
    const auszug = wandauszug([
      wand(),
      wand({ c: undefined, _id: 'A1' }),
      wand({ c: [0, 0, 1], _id: 'A2' }),
      wand({ c: [0, 0, 1, Number.NaN], _id: 'A3' }),
    ]);
    expect(auszug.waende).toHaveLength(1);
    expect(auszug.verworfen).toBe(3);
  });

  it('vertraegt eine Szene ohne Waende', () => {
    expect(wandauszug([])).toEqual({ waende: [], tueren: 0, doppel: 0, verworfen: 0 });
  });
});

/**
 * Die Eichung: Die vorhandenen Wanddateien hat
 * `tools/exportiere-waende.mjs` geschrieben. Schickt man sie durch den Weg
 * von innen, muss **Zeichen fuer Zeichen dasselbe** herauskommen — sonst
 * zeigte jeder Export im Modul die ganze Datei als geaendert, und niemand
 * koennte einen Pull Request noch lesen.
 */
describe('wanddateiText gegen die Dateien im Repo', () => {
  // Die Liste kommt aus den Tabellen des Moduls, nicht aus dem Verzeichnis:
  // Geprueft werden soll genau das, was der Import auch benutzt.
  const schluessel = Object.keys(KARTEN_EINSTELLUNGEN).filter((eintrag) => {
    const [szenario, datei] = eintrag.split('/') as [string, string];
    return kartenWaende(szenario, datei) !== undefined;
  });

  it('findet die Wanddateien ueberhaupt', () => {
    // Eine Schranke gegen den stillen Leerlauf: Faellt die Liste leer aus,
    // wuerde unten kein einziger Vergleich laufen und der Test doch gruen.
    expect(schluessel.length).toBeGreaterThanOrEqual(5);
  });

  for (const eintrag of schluessel) {
    it(`${eintrag} kommt unveraendert wieder heraus`, () => {
      const original = readFileSync(`daten/waende/${eintrag}.json`, 'utf8');
      const auszug = wandauszug(JSON.parse(original) as Record<string, unknown>[]);
      expect(auszug.doppel).toBe(0);
      expect(auszug.verworfen).toBe(0);
      expect(wanddateiText(auszug.waende)).toBe(original);
    });
  }
});

describe('kartenkennungAusPfad', () => {
  it('liest Szenario und Dateinamen aus dem Ablageschema', () => {
    expect(kartenkennungAusPfad('pfs/bilder/pfs_s08_01/the-laboratory.webp')).toEqual({
      szenario: '08-01',
      datei: 'the-laboratory',
    });
  });

  it('nimmt auch einen Namen mit Zaehler', () => {
    expect(kartenkennungAusPfad('pfs_s08_01/the-laboratory-2.webp')?.datei).toBe(
      'the-laboratory-2',
    );
  });

  it('liefert den Dateinamen auch ohne erkennbares Szenario', () => {
    expect(kartenkennungAusPfad('worlds/test/karten/eigene-karte.png')).toEqual({
      datei: 'eigene-karte',
    });
  });

  it('haengt nicht an einer Abfrage hinter dem Pfad', () => {
    expect(kartenkennungAusPfad('pfs_s08_05/nans-watch.webp?v=3')).toEqual({
      szenario: '08-05',
      datei: 'nans-watch',
    });
  });

  it('gibt nichts zurueck, wo kein Dateiname steht', () => {
    expect(kartenkennungAusPfad('')).toBeUndefined();
    expect(kartenkennungAusPfad('pfs_s08_01/')).toBeUndefined();
  });
});

describe('skalierungAus', () => {
  it('erkennt die doppelte Leinwand', () => {
    expect(skalierungAus(2650, 1325)).toBe(2);
  });

  it('faengt die Rundung der Leinwand auf', () => {
    // `apply.ts` legt die Leinwand mit `Math.round` an; ein Faktor 2 kommt
    // deshalb nicht als glatte Zahl zurueck.
    expect(skalierungAus(2649, 1325)).toBe(2);
  });

  it('nennt einen echten Zwischenwert mit zwei Stellen', () => {
    expect(skalierungAus(1988, 1325)).toBe(1.5);
  });

  it('erkennt die unskalierte Karte', () => {
    expect(skalierungAus(1325, 1325)).toBe(1);
  });

  it('gibt bei unbrauchbaren Massen nichts zurueck', () => {
    expect(skalierungAus(0, 1325)).toBeUndefined();
    expect(skalierungAus(2650, 0)).toBeUndefined();
    expect(skalierungAus(Number.NaN, 1325)).toBeUndefined();
  });
});

describe('wandBezeichner', () => {
  it('baut einen gueltigen Namen aus Schluessel und Datei', () => {
    expect(wandBezeichner('08-01', 'the-laboratory')).toBe('waende0801TheLaboratory');
    expect(wandBezeichner('08-05', 'nans-watch')).toBe('waende0805NansWatch');
  });

  it('faengt auch eine Datei ab, die mit einer Zahl beginnt', () => {
    expect(wandBezeichner('08-06', '2-the-mine')).toBe('waende08062TheMine');
  });
});

describe('quelltextzeilen', () => {
  const masse = { gitter: 87, versatzX: 19, versatzY: 22, skalierung: 2 };

  it('nennt den Ablageort der Wanddatei', () => {
    expect(quelltextzeilen('08-01', 'the-laboratory', masse).dateipfad).toBe(
      'daten/waende/08-01/the-laboratory.json',
    );
  });

  /**
   * Die zweite Eichung: Der erzeugte Eintrag muss **wortgleich** in
   * `karten-einstellungen.ts` stehen. Weicht die Schreibform ab, waere jede
   * eingesetzte Zeile eine Formatierungsaenderung mitten in der Tabelle.
   */
  it('schreibt den Messwert so, wie er in der Tabelle steht', () => {
    const quelle = readFileSync('src/world/karten-einstellungen.ts', 'utf8');
    const zeile = quelltextzeilen('08-01', 'the-laboratory', masse).einstellungsZeile;
    expect(quelle).toContain(zeile);
  });

  it('laesst die Skalierung 1 weg, wie die Tabelle es tut', () => {
    const ohne = quelltextzeilen('08-02', 'delusions-of-grandeur', {
      gitter: 43,
      versatzX: -25,
      versatzY: -27,
      skalierung: 1,
    }).einstellungsZeile;
    expect(ohne).not.toContain('skalierung');
    const quelle = readFileSync('src/world/karten-einstellungen.ts', 'utf8');
    expect(quelle).toContain(ohne);
  });

  it('baut Import und Tabelleneintrag passend zueinander', () => {
    const zeilen = quelltextzeilen('08-06', 'finding-the-mine', masse);
    expect(zeilen.importZeile).toBe(
      "import waende0806FindingTheMine from '../../daten/waende/08-06/finding-the-mine.json';",
    );
    expect(zeilen.tabellenZeile).toBe("  '08-06/finding-the-mine': waende0806FindingTheMine,");
  });
});
