import { describe, expect, it } from 'vitest';
import { alsKennung, raummarkenAufKarte, seiteZuBild, type KartenLage } from '../src/pdf/raummarken.ts';
import type { Block, TextRun } from '../src/pdf/types.ts';
import { linienAusOperatoren, type Kartenlinie } from '../src/pdf/kartenlinien.ts';
import { kartentexteAufKarte, kartenstricheAufKarte } from '../src/pdf/raummarken.ts';
import { notizAusDatei, notizInDatei } from '../src/world/kartenabgleich.ts';
import { formenAusStrichen, zeichnungenAusKarte } from '../src/world/kartenzeichnungen.ts';
import {
  markeAusPfad,
  markePfad,
  markeSvg,
  notizenAusMarken,
  seiteZurKennung,
} from '../src/world/raummarken.ts';

/** Eine Kartenbeschriftung an einer Stelle der Seite, Grundlinie bei `y`. */
function beschriftung(page: number, x: number, y: number, text: string, breite = 10): Block {
  const lauf = { page, x, y, width: breite, size: 6, font: 'X', glyphs: [], text } as TextRun;
  return { role: 'map-label', page, column: 0, text, lines: [{ page, column: 0, x, y, runs: [lauf] }] };
}

/** Ein Bild von 200 × 100 Punkten, aufrecht bei (100, 300) bis (300, 400). */
const AUFRECHT: KartenLage = { page: 4, matrix: [200, 0, 0, 100, 100, 300], width: 400, height: 200 };

describe('seiteZuBild', () => {
  it('rechnet einen Seitenpunkt in Bildpunkte um, oben links als Ursprung', () => {
    expect(seiteZuBild(AUFRECHT, { x: 100, y: 400 })).toEqual({ x: 0, y: 0 });
    expect(seiteZuBild(AUFRECHT, { x: 200, y: 350 })).toEqual({ x: 200, y: 100 });
  });

  it('versteht eine um 90 Grad gedrehte Karte', () => {
    // So liegen die Querformatkarten im Heft: [0 -h w 0 e f].
    const gedreht: KartenLage = { page: 4, matrix: [0, -200, 100, 0, 50, 400], width: 400, height: 200 };
    // Die erste Bildzeile (oben) liegt rechts auf der Seite.
    const oben = seiteZuBild(gedreht, { x: 150, y: 400 });
    expect(oben).toEqual({ x: 0, y: 0 });
    const unten = seiteZuBild(gedreht, { x: 50, y: 200 });
    expect(unten).toEqual({ x: 400, y: 200 });
  });

  it('meldet einen Punkt neben dem Bild als nicht vorhanden', () => {
    expect(seiteZuBild(AUFRECHT, { x: 50, y: 350 })).toBeUndefined();
  });
});

describe('raummarkenAufKarte', () => {
  it('nimmt nur Raumkennungen, die auf dem Bild stehen', () => {
    const marken = raummarkenAufKarte(AUFRECHT, [
      beschriftung(4, 195, 348, 'C2'),
      beschriftung(4, 150, 320, 'C3a'),
      beschriftung(4, 120, 310, '1 SQUARE = 5 FEET', 60),
      beschriftung(4, 20, 20, 'C9'),
      beschriftung(5, 195, 348, 'C4'),
    ]);
    expect(marken.map((marke) => marke.kennung)).toEqual(['C2', 'C3a']);
    // Mitte der Schrift: halbe Laufbreite, ein Drittel des Grads ueber der Grundlinie.
    expect(marken[0]).toEqual({ kennung: 'C2', x: 200, y: 100 });
  });
});

describe('markeSvg', () => {
  it('zeichnet die Kennung schwarz auf Weiss', () => {
    const svg = markeSvg('C3a');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('>C3a</text>');
  });
});

describe('markePfad', () => {
  it('legt das Markerbild neben die Karte in marker/', () => {
    expect(markePfad('bilder/pfs_s09_02/die-hoehle.webp', 'C2')).toBe('bilder/pfs_s09_02/marker/C2.svg');
  });
});

describe('seiteZurKennung', () => {
  const seiten = [
    { id: 's1', name: 'C. Die Hoehle' },
    { id: 's2', name: 'C1. Eingang' },
    { id: 's3', name: 'C12. Tiefer Schacht' },
    { id: 's4', name: 'C3a. Nische' },
  ];

  it('findet die Seite, deren Name mit Kennung und Punkt beginnt', () => {
    expect(seiteZurKennung('C1', seiten)?.id).toBe('s2');
    expect(seiteZurKennung('C12', seiten)?.id).toBe('s3');
    expect(seiteZurKennung('C3a', seiten)?.id).toBe('s4');
  });

  it('fuehrt einen Teilraum ohne eigene Seite zu seinem Raum', () => {
    expect(seiteZurKennung('C12b', seiten)?.id).toBe('s3');
  });

  it('verwechselt C1 nicht mit C12 und kennt keine fehlende Seite', () => {
    expect(seiteZurKennung('C1', [seiten[2]!])).toBeUndefined();
  });
});

describe('notizenAusMarken', () => {
  const seiten = [{ id: 's2', name: 'C1. Eingang' }];

  it('setzt die Notiz um Skalierung und Versatz verschoben an die Kennung', () => {
    const [notiz] = notizenAusMarken(
      [{ kennung: 'C1', x: 100, y: 50, }],
      seiten,
      { skalierung: 2, szene: { grid: { size: 80 }, shiftX: 20, shiftY: 10 } },
      { width: 800, height: 400 },
    );
    expect(notiz).toEqual({
      x: 180,
      y: 90,
      marke: 'C1',
      iconSize: 80,
      text: 'C1. Eingang',
      journal: 'journal',
      pageId: 's2',
    });
  });

  it('rechnet einen Rand so ein, wie Foundry ihn auf ganze Felder rundet', () => {
    const [notiz] = notizenAusMarken(
      [{ kennung: 'C1', x: 0, y: 0 }],
      seiten,
      { szene: { grid: { size: 100 }, padding: 0.25 } },
      { width: 1000, height: 500 },
    );
    // 0,25 × 1000 = 250 → drei Felder; 0,25 × 500 = 125 → zwei Felder.
    expect(notiz).toMatchObject({ x: 300, y: 200 });
  });

  it('behaelt eine Kennung ohne Journalseite als blosse Beschriftung', () => {
    const [notiz] = notizenAusMarken([{ kennung: 'C9', x: 0, y: 0 }], seiten, undefined, {
      width: 10,
      height: 10,
    });
    expect(notiz).toEqual({ x: 0, y: 0, marke: 'C9', iconSize: 100, text: 'C9' });
  });
});

describe('Aussehen der Raummarker', () => {
  it('nimmt Grund- und Schriftfarbe aus den Einstellungen', () => {
    const svg = markeSvg('C1', { grund: '#112233', schrift: '#ffeedd' });
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('stroke="#ffeedd"');
    expect(svg).toContain('fill="#ffeedd"');
  });

  it('laesst nichts als eine Farbe ins Bild', () => {
    const svg = markeSvg('C1', { grund: '"/><script/>', schrift: 'rot' });
    expect(svg).not.toContain('script');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('macht den Marker so gross, wie die Einstellung in Feldern sagt', () => {
    const [notiz] = notizenAusMarken(
      [{ kennung: 'C1', x: 0, y: 0 }],
      [],
      { szene: { grid: { size: 80 } } },
      { width: 10, height: 10 },
      1.5,
    );
    expect(notiz).toMatchObject({ iconSize: 120 });
  });
});

describe('alsKennung', () => {
  it('schreibt den Zusatzbuchstaben klein, wie im Text', () => {
    expect(alsKennung('C3A')).toBe('C3a');
    expect(alsKennung('C12')).toBe('C12');
    expect(alsKennung('TRAP')).toBeUndefined();
  });
});

describe('kartentexteAufKarte', () => {
  it('fasst die Zeilen eines Blocks zusammen und laesst Rand und Kennungen weg', () => {
    const mehrzeilig: Block = {
      ...beschriftung(4, 150, 330, 'ALLE'),
      lines: [...beschriftung(4, 150, 330, 'ALLE').lines, ...beschriftung(4, 150, 322, 'HIER').lines],
    };
    const mitKennung: Block = {
      ...beschriftung(4, 250, 330, 'C2'),
      lines: [...beschriftung(4, 250, 330, 'C2').lines, ...beschriftung(4, 270, 330, 'C4').lines],
    };
    const texte = kartentexteAufKarte(AUFRECHT, [
      mehrzeilig,
      mitKennung,
      beschriftung(4, 120, 310, '1 SQUARE = 5 FEET', 60),
    ]);
    expect(texte.map((text) => text.text)).toEqual(['ALLE HIER']);
    // 6 Punkt Schrift, 2 Bildpunkte je Seitenpunkt.
    expect(texte[0]!.groesse).toBe(12);
  });
});

/** Operatoren wie pdf.js sie nummeriert — hier frei gewaehlt. */
const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setDash: 5, setStrokeRGBColor: 6,
  constructPath: 7, stroke: 8, paintImageXObject: 9, moveTo: 13, lineTo: 14, rectangle: 19,
};

describe('linienAusOperatoren', () => {
  it('liest Farbe, Staerke, Strichelung und Lage einer Linie', () => {
    const linien = linienAusOperatoren(
      4,
      [OPS.paintImageXObject, OPS.save, OPS.transform, OPS.setLineWidth, OPS.setDash, OPS.setStrokeRGBColor, OPS.constructPath, OPS.stroke, OPS.restore],
      [['karte'], [], [2, 0, 0, 2, 10, 20], [1.5], [[3, 3], 0], [255, 0, 0], [[13, 14], [0, 0, 5, 0]], [], []],
      OPS,
    );
    expect(linien).toEqual([
      {
        page: 4,
        punkte: [{ x: 10, y: 20 }, { x: 20, y: 20 }],
        geschlossen: false,
        farbe: '#ff0000',
        breite: 3,
        gestrichelt: true,
        ueber: ['karte'],
      },
    ]);
  });

  it('macht aus einem Rechteck einen geschlossenen Linienzug', () => {
    const [linie] = linienAusOperatoren(1, [OPS.constructPath, OPS.stroke], [[[19], [0, 0, 4, 2]], []], OPS);
    expect(linie!.geschlossen).toBe(true);
    expect(linie!.punkte).toHaveLength(4);
  });
});

describe('kartentexteAufKarte, verstreute Zeilen', () => {
  it('trennt Zeilen eines Blocks, die an verschiedenen Stellen stehen', () => {
    const verstreut: Block = {
      ...beschriftung(4, 120, 380, 'WACHE'),
      lines: [...beschriftung(4, 120, 380, 'WACHE').lines, ...beschriftung(4, 250, 320, 'KOCH').lines],
    };
    expect(kartentexteAufKarte(AUFRECHT, [verstreut]).map((text) => text.text)).toEqual(['WACHE', 'KOCH']);
  });
});

describe('kartenstricheAufKarte', () => {
  const linie = (ueber: string[]): Kartenlinie => ({
    page: 4,
    punkte: [{ x: 150, y: 350 }, { x: 200, y: 350 }],
    geschlossen: false,
    farbe: '#ff0000',
    breite: 1,
    gestrichelt: false,
    ueber,
  });

  it('nimmt nur Linien, die nach dem Kartenbild gezeichnet sind', () => {
    const lage = { ...AUFRECHT, name: 'karte' };
    expect(kartenstricheAufKarte(lage, [linie(['karte']), linie([])])).toHaveLength(1);
  });

  it('erkennt das Kartenbild auch unter seinem Namen im gemeinsamen Speicher', () => {
    const lage = { ...AUFRECHT, name: 'img_p8_1' };
    expect(kartenstricheAufKarte(lage, [linie(['g_d2_img_p8_1'])])).toHaveLength(1);
  });
});

describe('formenAusStrichen', () => {
  const strich = (punkte: Array<[number, number]>, gestrichelt = false) => ({
    punkte: punkte.map(([x, y]) => ({ x, y })),
    geschlossen: false,
    farbe: '#ffffff',
    breite: 2,
    gestrichelt,
  });

  it('fuegt Kanten und Ecken einer Farbe zu einem Rahmen', () => {
    const formen = formenAusStrichen([
      strich([[10, 0], [90, 0]], true),
      strich([[100, 10], [100, 40]], true),
      strich([[90, 50], [10, 50]], true),
      strich([[0, 40], [0, 10]], true),
      strich([[96, 0], [100, 0], [100, 4]]),
      strich([[100, 46], [100, 50], [96, 50]]),
      strich([[4, 50], [0, 50], [0, 46]]),
      strich([[0, 4], [0, 0], [4, 0]]),
    ]);
    expect(formen).toHaveLength(1);
    expect(formen[0]).toMatchObject({ rahmen: true, kasten: { links: 0, oben: 0, rechts: 100, unten: 50 } });
  });

  it('trennt zwei Kaesten, die dicht uebereinander stehen', () => {
    // Je ein Feld, 4 Bildpunkte Abstand: Kanten gestrichelt, Ecken durchgezogen.
    const kasten = (o: number) => [
      strich([[10, o], [30, o]], true),
      strich([[40, o + 10], [40, o + 30]], true),
      strich([[30, o + 40], [10, o + 40]], true),
      strich([[0, o + 30], [0, o + 10]], true),
      strich([[35, o], [40, o], [40, o + 5]]),
      strich([[40, o + 35], [40, o + 40], [35, o + 40]]),
      strich([[5, o + 40], [0, o + 40], [0, o + 35]]),
      strich([[0, o + 5], [0, o], [5, o]]),
    ];
    const formen = formenAusStrichen([...kasten(0), ...kasten(44)]);
    expect(formen.map((form) => [form.rahmen, form.kasten.oben])).toEqual([
      [true, 0],
      [true, 44],
    ]);
  });

  it('trennt einen Rahmen, der in einem anderen liegt', () => {
    const rahmen = (l: number, o: number, r: number, u: number) => [
      strich([[l, o], [r, o]]),
      strich([[r, o], [r, u]]),
      strich([[r, u], [l, u]]),
      strich([[l, u], [l, o]]),
    ];
    const formen = formenAusStrichen([...rahmen(0, 0, 200, 200), ...rahmen(50, 50, 150, 150)]);
    expect(formen.map((form) => [form.rahmen, form.kasten.links])).toEqual([
      [true, 0],
      [true, 50],
    ]);
  });

  it('laesst einzelne Linien einzeln', () => {
    const formen = formenAusStrichen([strich([[0, 0], [0, 50]]), strich([[200, 0], [200, 50]])]);
    expect(formen.map((form) => form.rahmen)).toEqual([false, false]);
  });
});

describe('zeichnungenAusKarte', () => {
  const rahmen = [
    [[0, 0], [100, 0]],
    [[100, 0], [100, 50]],
    [[100, 50], [0, 50]],
    [[0, 50], [0, 0]],
  ].map((zug) => ({
    punkte: zug.map(([x, y]) => ({ x: x!, y: y! })),
    geschlossen: false,
    farbe: '#ffffff',
    breite: 2,
    gestrichelt: true,
  }));

  it('setzt eine Beschriftung in ihren Rahmen und verbirgt alles vor den Spielern', () => {
    const zeichnungen = zeichnungenAusKarte(
      [
        { text: 'FALLE', x: 50, y: 25, groesse: 12 },
        { text: 'START', x: 300, y: 300, groesse: 12 },
      ],
      rahmen,
      { skalierung: 2 },
      { width: 1000, height: 1000 },
    );
    expect(zeichnungen).toHaveLength(2);
    expect(zeichnungen.every((z) => z.hidden === true)).toBe(true);
    expect(zeichnungen[0]).toMatchObject({
      x: 0,
      y: 0,
      shape: { type: 'r', width: 200, height: 100 },
      text: 'FALLE',
      fontSize: 24,
      strokeColor: '#ffffff',
      strokeWidth: 4,
      strokeAlpha: 0.6,
    });
    // Die freie Beschriftung: ohne Linie, mittig um ihren Punkt.
    expect(zeichnungen[1]).toMatchObject({ text: 'START', strokeWidth: 0 });
  });
});

describe('Marker in der Kartendatei', () => {
  it('fuehrt einen Marker als Kennung, nicht als Bildpfad', () => {
    const { notiz } = notizInDatei(
      { _id: 'x', x: 5, y: 6, texture: { src: 'bilder/pfs_s09_02/marker/C3a.svg', fit: 'contain' } },
      () => undefined,
    );
    expect(notiz).toMatchObject({ x: 5, y: 6, marke: 'C3a', texture: { fit: 'contain' } });
    expect((notiz.texture as Record<string, unknown>).src).toBeUndefined();
  });

  it('setzt beim Anlegen den Pfad neben der Karte dieser Welt', () => {
    const notiz = notizAusDatei({ x: 5, marke: 'C1' }, {}, 'meine/pfs_s09_02/hoehle.webp');
    expect(notiz).toMatchObject({ texture: { src: 'meine/pfs_s09_02/marker/C1.svg' } });
    expect(notiz.marke).toBeUndefined();
  });

  it('erkennt nur Markerbilder als Marker', () => {
    expect(markeAusPfad('a/marker/B7.svg')).toBe('B7');
    expect(markeAusPfad('a/portrait.webp')).toBeUndefined();
  });
});
