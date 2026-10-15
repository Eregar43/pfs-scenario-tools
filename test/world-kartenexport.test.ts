import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alleKarten, kartendateiPfad } from '../src/world/karten.ts';
import { szenenAbweichung, szenenStand, tiefMischen } from '../src/world/kartenabgleich.ts';
import {
  EXPORT_FELDER,
  kartenauszug,
  kartendateiText,
  kartenkennungAusPfad,
  skalierungAus,
  wandauszug,
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
 * Eine Szene, wie der Import sie aus einer Kartendatei anlegt — als
 * Quelldaten, so wie `toObject()` sie liefert, mit Kennungen und Fremd-Flags.
 */
function szeneAusDatei(daten: ReturnType<typeof alleKarten> extends ReadonlyMap<string, infer T> ? T : never) {
  const mitKennung = (eintrag: Record<string, unknown>, index: number) => ({
    _id: `Kennung${String(index).padStart(9, '0')}`,
    flags: { fremd: { x: 1 } },
    ...eintrag,
  });
  return {
    ...tiefMischen(
      { name: 'Karte', padding: 0, grid: { alpha: 0, type: 1 }, initial: { x: 5 }, thumb: 'x.webp' },
      daten.szene ?? {},
    ),
    levels: [tiefMischen({ _id: 'defaultLevel0000', background: { src: 'karte.webp', color: '#000000' } }, daten.ebene ?? {})],
    walls: (daten.waende ?? []).map(mitKennung),
    lights: (daten.lichter ?? []).map(mitKennung),
    regions: daten.regionen ?? [],
    notes: [],
    drawings: (daten.zeichnungen ?? []).map(mitKennung),
  };
}

/**
 * Die Eichung: Jede Kartendatei im Repo, durch den Import in eine Szene
 * gelegt und wieder exportiert, muss ihre Werte behalten — und der Import
 * muss die frisch exportierte Datei als „stimmt ueberein" erkennen. Sonst
 * zeigte jeder Export Aenderungen, die keiner gemacht hat.
 */
describe('Kartendateien im Repo', () => {
  const karten = [...alleKarten()];

  it('findet die Kartendateien ueberhaupt', () => {
    // Eine Schranke gegen den stillen Leerlauf: Faellt die Liste leer aus,
    // wuerde unten kein einziger Vergleich laufen und der Test doch gruen.
    expect(karten.length).toBeGreaterThanOrEqual(11);
  });

  for (const [schluessel, daten] of karten) {
    it(`${schluessel} steht in der Schreibform des Exports`, () => {
      const [szenario, datei] = schluessel.split('/') as [string, string];
      expect(kartendateiText(daten)).toBe(readFileSync(kartendateiPfad(szenario, datei), 'utf8'));
    });

    it(`${schluessel} uebersteht Import und Export`, () => {
      const szene = szeneAusDatei(daten);
      const auszug = kartenauszug(szene, { skalierung: daten.skalierung ?? 1, artVon: () => undefined });
      expect(auszug.waende.doppel).toBe(0);
      expect(auszug.waende.verworfen).toBe(0);
      expect(auszug.daten.waende).toEqual(daten.waende);
      expect(auszug.daten.skalierung).toBe(daten.skalierung);
      // Der Export nimmt mehr Szenenfelder mit, als die alten Dateien
      // nennen — aber jedes genannte mit demselben Wert.
      expect(auszug.daten.szene).toMatchObject(daten.szene ?? {});
      expect(szenenAbweichung(szenenStand(szene, () => undefined), auszug.daten)).toEqual({
        szene: false,
        ebene: false,
        waende: false,
        lichter: false,
        regionen: false,
        notizen: false,
        zeichnungen: false,
      });
    });
  }
});

describe('kartenauszug', () => {
  const basis = {
    name: 'Karte',
    thumb: 'worlds/w/thumb.webp',
    navigation: false,
    initial: { x: 10, y: 20, scale: 1 },
    initialLevel: 'defaultLevel0000',
    grid: { size: 87, alpha: 0, type: 1 },
    shiftX: -43,
    shiftY: 28,
    padding: 0,
    tokenVision: true,
    fog: { mode: 1, reset: 1791559808465, overlay: 'nebel.webp', colors: { explored: null } },
    environment: { darknessLevel: 0.4, globalLight: { enabled: true } },
    weather: '',
    transition: { duration: 1500 },
    levels: [
      {
        _id: 'defaultLevel0000',
        name: 'Level',
        elevation: { bottom: 0, top: 20 },
        background: { src: 'karte.webp', color: '#000000', tint: '#ffffff' },
        foreground: { src: 'vorne.webp', tint: '#ffffff' },
        fog: { src: null },
        textures: { fit: 'fill' },
        visibility: { levels: [] },
      },
    ],
    walls: [],
    lights: [],
    regions: [],
    notes: [],
    drawings: [],
  };
  const artVon = (id: string) => (id === 'HauptJournal0001' ? ('journal' as const) : undefined);

  it('nimmt die Szeneneinstellungen ohne Startansicht, Bildpfade und Weltgebundenes', () => {
    const { daten } = kartenauszug(basis, { skalierung: 2, artVon });
    expect(daten.skalierung).toBe(2);
    expect(daten.szene).toEqual({
      grid: { size: 87, alpha: 0, type: 1 },
      shiftX: -43,
      shiftY: 28,
      padding: 0,
      tokenVision: true,
      fog: { mode: 1, colors: { explored: null } },
      environment: { darknessLevel: 0.4, globalLight: { enabled: true } },
      weather: '',
      transition: { duration: 1500 },
    });
    expect(daten.ebene).toEqual({
      elevation: { bottom: 0, top: 20 },
      background: { color: '#000000', tint: '#ffffff' },
      foreground: { tint: '#ffffff' },
      textures: { fit: 'fill' },
    });
    expect(kartendateiText(daten)).not.toMatch(/webp/);
  });

  it('laesst die Skalierung 1 und leere Sammlungen weg', () => {
    const { daten } = kartenauszug(basis, { skalierung: 1, artVon });
    expect(Object.keys(daten)).toEqual(['szene', 'ebene']);
  });

  it('nimmt Lichter ohne Kennung und Fremd-Flags', () => {
    const { daten, lichter } = kartenauszug(
      { ...basis, lights: [{ _id: 'L1', x: 1, y: 2, config: { bright: 10 }, flags: { a: {} }, _stats: {} }] },
      { skalierung: 1, artVon },
    );
    expect(lichter).toBe(1);
    expect(daten.lichter).toEqual([{ x: 1, y: 2, config: { bright: 10 } }]);
  });

  it('behaelt bei Regionen die Kennung und wirft Skript-Verhalten heraus', () => {
    const { daten, verhaltenVerworfen } = kartenauszug(
      {
        ...basis,
        regions: [
          {
            _id: 'Region0000000001',
            name: 'Falle',
            shapes: [{ type: 'rectangle', x: 0, y: 0, width: 87, height: 87 }],
            behaviors: [
              { _id: 'Verhalten0000001', type: 'pauseGame', system: {}, flags: {} },
              { _id: 'Verhalten0000002', type: 'executeScript', system: { source: 'boese()' } },
              { _id: 'Verhalten0000003', type: 'executeMacro', system: { uuid: 'Macro.x' } },
            ],
            flags: { fremd: {} },
          },
        ],
      },
      { skalierung: 1, artVon },
    );
    expect(verhaltenVerworfen).toBe(2);
    expect(daten.regionen).toEqual([
      {
        _id: 'Region0000000001',
        name: 'Falle',
        shapes: [{ type: 'rectangle', x: 0, y: 0, width: 87, height: 87 }],
        behaviors: [{ _id: 'Verhalten0000001', type: 'pauseGame', system: {} }],
      },
    ]);
  });

  it('gibt Notizen die Journal-Art und nimmt fremde Bilder und Verweise heraus', () => {
    const { daten, verweiseEntfernt, bilderEntfernt } = kartenauszug(
      {
        ...basis,
        notes: [
          { _id: 'N1', x: 1, entryId: 'HauptJournal0001', pageId: 'S1', texture: { src: 'icons/svg/book.svg' } },
          { _id: 'N2', x: 2, entryId: 'FremdesJournal01', pageId: 'S2', texture: { src: 'worlds/w/pin.png', tint: null } },
        ],
      },
      { skalierung: 1, artVon },
    );
    expect(daten.notizen).toEqual([
      { x: 1, texture: { src: 'icons/svg/book.svg' }, journal: 'journal', pageId: 'S1' },
      { x: 2, texture: { tint: null } },
    ]);
    expect(verweiseEntfernt).toBe(1);
    expect(bilderEntfernt).toBe(1);
  });

  it('nimmt Zeichnungen ohne Autor und ohne fremde Fuellbilder', () => {
    const { daten, bilderEntfernt } = kartenauszug(
      {
        ...basis,
        drawings: [
          { _id: 'D1', author: 'Benutzer00000001', shape: { type: 'r' }, texture: 'worlds/w/muster.png' },
          { _id: 'D2', author: 'Benutzer00000001', shape: { type: 'e' }, text: 'Buehne', texture: null },
        ],
      },
      { skalierung: 1, artVon },
    );
    expect(daten.zeichnungen).toEqual([
      { shape: { type: 'r' } },
      { shape: { type: 'e' }, text: 'Buehne', texture: null },
    ]);
    expect(bilderEntfernt).toBe(1);
  });
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
