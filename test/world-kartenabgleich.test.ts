import { describe, expect, it } from 'vitest';
import {
  enthaelt,
  notizAusDatei,
  notizInDatei,
  sammlungGleich,
  szenenAbweichung,
  szenenStand,
  tiefMischen,
  weichtAb,
} from '../src/world/kartenabgleich.ts';

/** Ein Licht, wie `AmbientLightDocument#toObject()` es liefert (gekuerzt). */
function licht(werte: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: 'LiChTlIcHtLiChT1',
    x: 500,
    y: 400,
    elevation: 0,
    rotation: 0,
    walls: true,
    vision: false,
    hidden: false,
    config: { bright: 10, dim: 20, color: '#ffaa00', animation: { type: 'torch', speed: 5 } },
    flags: {},
    ...werte,
  };
}

describe('enthaelt', () => {
  it('vergleicht nur die Schluessel des Solls', () => {
    expect(enthaelt({ grid: { size: 87, alpha: 0, type: 1 }, neu: 1 }, { grid: { size: 87 } })).toBe(true);
    expect(enthaelt({ grid: { size: 86 } }, { grid: { size: 87 } })).toBe(false);
  });

  it('verlangt bei Listen gleiche Laenge und gleiche Reihenfolge', () => {
    expect(enthaelt({ c: [1, 2, 3, 4] }, { c: [1, 2, 3, 4] })).toBe(true);
    expect(enthaelt({ c: [1, 2, 3] }, { c: [1, 2, 3, 4] })).toBe(false);
    expect(enthaelt({ c: [4, 3, 2, 1] }, { c: [1, 2, 3, 4] })).toBe(false);
  });

  it('nimmt null und fehlend als gleich', () => {
    expect(enthaelt({}, { color: null })).toBe(true);
    expect(enthaelt({ color: null }, { color: null })).toBe(true);
    expect(enthaelt({ color: '#000000' }, { color: null })).toBe(false);
  });
});

describe('sammlungGleich', () => {
  it('ignoriert Reihenfolge, Kennung und Fremdfelder der Welt', () => {
    const datei = [
      { x: 500, y: 400, config: { bright: 10 } },
      { x: 100, y: 100, config: { bright: 0 } },
    ];
    const welt = [
      licht({ x: 100, y: 100, config: { bright: 0, dim: 5 } }),
      licht({ _id: 'AnDeReKeNnUnG000' }),
    ];
    expect(sammlungGleich(welt, datei)).toBe(true);
  });

  it('erkennt ein verschobenes, ein fehlendes und ein zusaetzliches Licht', () => {
    const datei = [{ x: 500, y: 400 }];
    expect(sammlungGleich([licht({ x: 501 })], datei)).toBe(false);
    expect(sammlungGleich([], datei)).toBe(false);
    expect(sammlungGleich([licht(), licht({ x: 1 })], datei)).toBe(false);
  });

  it('ordnet jedes Soll-Stueck nur einem Ist-Stueck zu', () => {
    expect(sammlungGleich([licht(), licht({ x: 1 })], [{ x: 500 }, { x: 500 }])).toBe(false);
  });
});

describe('tiefMischen', () => {
  it('laesst oben gewinnen und mischt Objekte tief', () => {
    expect(tiefMischen({ grid: { alpha: 0 }, padding: 0 }, { grid: { size: 87 }, padding: 0.1 })).toEqual({
      grid: { alpha: 0, size: 87 },
      padding: 0.1,
    });
  });

  it('ersetzt Listen statt sie zu mischen und laesst die Eingaben in Ruhe', () => {
    const unten = { c: [1, 2, 3, 4], a: { b: 1 } };
    const ergebnis = tiefMischen(unten, { c: [9], a: { d: 2 } });
    expect(ergebnis).toEqual({ c: [9], a: { b: 1, d: 2 } });
    expect(unten).toEqual({ c: [1, 2, 3, 4], a: { b: 1 } });
  });
});

describe('Notizen', () => {
  const artVon = (id: string) => (id === 'HauptJournal0001' ? ('journal' as const) : undefined);

  it('ersetzt die Journal-Kennung durch die Art und behaelt die Seite', () => {
    const { notiz, verweisEntfernt } = notizInDatei(
      { _id: 'N1', x: 10, y: 20, entryId: 'HauptJournal0001', pageId: 'SeiteSeite000001', text: '', flags: {} },
      artVon,
    );
    expect(notiz).toEqual({ x: 10, y: 20, text: '', journal: 'journal', pageId: 'SeiteSeite000001' });
    expect(verweisEntfernt).toBe(false);
  });

  it('nimmt einer Notiz auf ein fremdes Journal den Verweis und sagt es an', () => {
    const { notiz, verweisEntfernt } = notizInDatei(
      { x: 10, y: 20, entryId: 'FremdesJournal01', pageId: 'P', text: 'Altar' },
      artVon,
    );
    expect(notiz).toEqual({ x: 10, y: 20, text: 'Altar' });
    expect(verweisEntfernt).toBe(true);
  });

  it('setzt beim Anlegen die Kennung dieser Welt ein', () => {
    expect(
      notizAusDatei({ x: 1, journal: 'anhangJournal', pageId: 'P' }, { anhangJournal: 'Spielhilfen00001' }),
    ).toEqual({ x: 1, entryId: 'Spielhilfen00001', pageId: 'P' });
  });

  it('legt eine Notiz ohne Ziel-Journal ohne Verweis an', () => {
    expect(notizAusDatei({ x: 1, journal: 'handoutJournal', pageId: 'P' }, {})).toEqual({
      x: 1,
      entryId: null,
      pageId: null,
    });
  });
});

describe('szenenAbweichung', () => {
  const welt = {
    width: 2168,
    grid: { size: 87, alpha: 0, type: 1 },
    shiftX: -43,
    shiftY: 28,
    environment: { darknessLevel: 0 },
    levels: [{ _id: 'defaultLevel0000', background: { src: 'bild.webp', color: '#000000' } }],
    walls: [],
    lights: [licht()],
    regions: [],
    notes: [{ _id: 'N', x: 1, y: 2, entryId: 'HauptJournal0001', pageId: 'S' }],
    drawings: [],
  };
  const artVon = (id: string) => (id === 'HauptJournal0001' ? ('journal' as const) : undefined);
  const stand = szenenStand(welt, artVon);

  it('meldet nichts, wenn die Szene alles enthaelt, was die Datei nennt', () => {
    const abweichung = szenenAbweichung(stand, {
      szene: { grid: { size: 87 }, shiftX: -43 },
      ebene: { background: { color: '#000000' } },
      lichter: [{ x: 500, y: 400, config: { bright: 10 } }],
      notizen: [{ x: 1, y: 2, journal: 'journal', pageId: 'S' }],
    });
    expect(weichtAb(abweichung)).toBe(false);
  });

  it('meldet genau den Teil, der abweicht', () => {
    const abweichung = szenenAbweichung(stand, {
      szene: { environment: { darknessLevel: 0.5 } },
      lichter: [{ x: 500, y: 400, config: { bright: 10 } }],
    });
    expect(abweichung).toEqual({
      szene: true,
      ebene: false,
      waende: false,
      lichter: false,
      regionen: false,
      notizen: false,
      zeichnungen: false,
    });
  });

  it('laesst Teile, die die Datei nicht nennt, dem Spielleiter', () => {
    // Die Szene hat ein Licht und eine Notiz, die Datei nennt keine — das
    // ist keine Abweichung, der Import faesst sie nicht an.
    expect(weichtAb(szenenAbweichung(stand, { szene: { shiftX: -43 } }))).toBe(false);
  });

  it('meldet eine leere Liste in der Datei als Abweichung, wenn die Szene etwas hat', () => {
    // Eine leere Liste heisst „diese Karte hat keine Lichter" — anders als
    // eine fehlende.
    expect(szenenAbweichung(stand, { lichter: [] }).lichter).toBe(true);
  });
});
