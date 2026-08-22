import { describe, expect, it } from 'vitest';
import { distanceTo, isObject, nameFor, nameImages, paareBildunterschriften, slugify } from '../src/pdf/imagenames.ts';
import type { ExtractedImage } from '../src/pdf/images.ts';
import type { Block } from '../src/pdf/types.ts';

/** Ein Bild an einer Stelle der Seite; die Pixel spielen hier keine Rolle. */
function image(page: number, box: [number, number, number, number], figur = true): ExtractedImage {
  const [left, bottom, right, top] = box;
  return {
    page,
    at: { left, bottom, right, top },
    name: 'img',
    width: 100,
    height: 100,
    kind: figur ? 3 : 2,
    role: figur ? 'figur' : 'karte',
    data: new Uint8Array(0),
  };
}

function text(role: Block['role'], page: number, x: number, y: number, value: string): Block {
  return { role, page, column: 0, text: value, lines: [{ x, y, runs: [] } as never] };
}

/** Eine Zeile mit echten Laufdaten — noetig, wo Namen im Block zerfallen. */
function zeile(y: number, segmente: { x: number; width: number; text: string }[]): never {
  return {
    x: segmente[0]!.x,
    y,
    runs: segmente.map((s) => ({ x: s.x, width: s.width, text: s.text })),
  } as never;
}

function labelBlock(page: number, zeilen: never[], value: string): Block {
  return { role: 'heading', page, column: 0, text: value, lines: zeilen };
}

describe('slugify', () => {
  it('macht aus Namen Dateinamen wie der Extractor', () => {
    expect(slugify('Karrenholt')).toBe('karrenholt');
    expect(slugify('First Mate Marrowen')).toBe('first-mate-marrowen');
    expect(slugify('Séance')).toBe('seance');
  });
});

describe('distanceTo', () => {
  it('misst null innerhalb des Bildes', () => {
    expect(distanceTo({ left: 10, bottom: 10, right: 50, top: 50 }, 30, 30)).toBe(0);
  });

  it('misst den kuerzesten Weg zum Rand', () => {
    const at = { left: 10, bottom: 10, right: 50, top: 50 };
    expect(distanceTo(at, 60, 30)).toBe(10);
    expect(distanceTo(at, 30, 0)).toBe(10);
  });
});

describe('nameFor', () => {
  it('nimmt die Bildunterschrift daneben', () => {
    const blocks = [
      text('caption', 5, 160, 180, 'Ingrit and Tagheema'),
      text('heading', 5, 72, 700, 'Getting Started'),
    ];
    expect(nameFor(image(5, [150, 200, 300, 500]), blocks)).toBe('Ingrit and Tagheema');
  });

  it('zieht die Bildunterschrift der naeheren Ueberschrift vor', () => {
    // Die Unterschrift ist eigens fuer das Bild gesetzt, die Ueberschrift steht
    // nur zufaellig daneben — auch wenn sie dichter dran ist.
    const blocks = [
      text('heading', 5, 305, 505, 'Kids these Days'),
      text('caption', 5, 160, 180, 'Teritha'),
    ];
    expect(nameFor(image(5, [150, 200, 300, 500]), blocks)).toBe('Teritha');
  });

  it('nimmt ohne Unterschrift die naechste Ueberschrift', () => {
    // Aeltere Jahrgaenge setzen gar keine Bildunterschriften; dort traegt die
    // Abschnittsueberschrift den Namen.
    const blocks = [
      text('heading', 8, 72, 700, 'Adventure Background'),
      text('heading', 8, 310, 480, 'Danbry'),
    ];
    expect(nameFor(image(8, [300, 200, 560, 460]), blocks)).toBe('Danbry');
  });

  it('gibt einer ganzseitigen Karte die Begegnung davor', () => {
    // Auf der Kartenseite steht kein Text. Die naechste Ueberschrift davor ist
    // `Conclusion` — gemeint ist aber die Begegnung `Boarding Action`.
    const blocks = [
      text('heading', 8, 72, 600, 'Boarding Action Moderate 1'),
      text('heading', 8, 72, 300, 'Conclusion'),
    ];
    expect(nameFor(image(9, [40, 40, 560, 700], false), blocks)).toBe('Boarding Action');
  });

  it('streicht Ortskennung und Schwierigkeitsgrad', () => {
    const blocks = [text('heading', 4, 72, 700, 'A. Karrenholt')];
    expect(nameFor(image(5, [40, 40, 560, 700], false), blocks)).toBe('Karrenholt');
  });

  it('nimmt die Stufenzeile nicht fuer einen Namen', () => {
    // `Levels 1–2` trennt zwei Fassungen derselben Begegnung.
    const blocks = [
      text('heading', 7, 72, 500, 'Levels 1–2'),
      text('heading', 7, 72, 400, 'Crying Cicada'),
    ];
    expect(nameFor(image(7, [60, 100, 300, 380]), blocks)).toBe('Crying Cicada');
  });

  it('bleibt namenlos, wenn nichts dasteht', () => {
    expect(nameFor(image(5, [40, 40, 560, 700]), [])).toBeUndefined();
  });

  it('trennt nebeneinanderstehende Namen in einer Zeile', () => {
    // Spielhilfen-Seite von 8-01: `Ella` und `Poppet Mage` stehen auf einer
    // Grundlinie in einem Block, 237 Punkte auseinander.
    const blocks = [
      labelBlock(
        13,
        [zeile(375, [
          { x: 145, width: 24, text: 'Ella' },
          { x: 406, width: 81, text: 'Poppet Mage' },
        ])],
        'Ella Poppet Mage',
      ),
    ];

    expect(nameFor(image(13, [54, 422, 260, 652]), blocks)).toBe('Ella');
    expect(nameFor(image(13, [314, 404, 579, 670]), blocks)).toBe('Poppet Mage');
  });

  it('trennt uebereinanderstehende Namen in einem Block', () => {
    // Ebenfalls Spielhilfen: `Zarta Dralneen` und `Rain in Cloudy Day`
    // stehen im Mittelstreifen zwischen den Bildern, 36 Punkte auseinander
    // im selben Block — gut drei Zeilenhoehen, kein Umbruch.
    const blocks = [
      labelBlock(
        12,
        [
          zeile(375, [{ x: 111, width: 92, text: 'Zarta Dralneen' }]),
          zeile(339, [{ x: 95, width: 124, text: 'Rain in Cloudy Day' }]),
        ],
        'Zarta Dralneen Rain in Cloudy Day',
      ),
    ];

    expect(nameFor(image(12, [24, 399, 290, 675]), blocks)).toBe('Zarta Dralneen');
    expect(nameFor(image(12, [45, 62, 251, 328]), blocks)).toBe('Rain in Cloudy Day');
  });

  it('haelt die Appendix-Ueberschrift fuer keinen Namen', () => {
    // `Appendix: Game Aids` steht direkt ueber den Bildern und laege am
    // naechsten — der Name steht aber unter dem Bild.
    const blocks = [
      text('heading', 13, 235, 675, 'Appendix: Game Aids'),
      text('heading', 13, 145, 375, 'Ella'),
    ];
    expect(nameFor(image(13, [54, 422, 260, 652]), blocks)).toBe('Ella');
  });
});

describe('paareBildunterschriften', () => {
  it('liefert die Unterschrift im Wortlaut, ohne Bereinigung', () => {
    // Der Wortlaut muss zeichengleich mit dem Kommentar im Journal sein.
    const bild = image(5, [150, 200, 300, 500]);
    const blocks = [text('caption', 5, 160, 180, 'Ingrit  and   Tagheema')];
    expect(paareBildunterschriften([bild], blocks).get(bild)).toBe('Ingrit  and   Tagheema');
  });

  it('gibt die Unterschrift dem naechsten Bild, nicht dem ersten', () => {
    // Auf der Seite von 8-01 lagen Inselkarte und Portraet beide in
    // Reichweite von „Zarta Dralneen" — gewinnen muss das Portraet daneben.
    const fern = image(5, [40, 400, 300, 700]);
    const nah = image(5, [150, 200, 300, 500]);
    const blocks = [text('caption', 5, 160, 180, 'Zarta Dralneen')];

    const paare = paareBildunterschriften([fern, nah], blocks);
    expect(paare.get(nah)).toBe('Zarta Dralneen');
    expect(paare.has(fern)).toBe(false);
  });

  it('laesst Karten nicht um Unterschriften konkurrieren', () => {
    // Eine Unterschrift benennt die Figur daneben; die Karte hat ihre
    // Begegnung.
    const karte = image(5, [150, 200, 300, 500], false);
    const blocks = [text('caption', 5, 160, 180, 'Zarta Dralneen')];
    expect(paareBildunterschriften([karte], blocks).size).toBe(0);
  });

  it('vergibt jede Unterschrift und jedes Bild nur einmal', () => {
    const erstes = image(5, [150, 200, 300, 500]);
    const zweites = image(5, [320, 200, 470, 500]);
    const blocks = [
      text('caption', 5, 160, 180, 'Ella'),
      text('caption', 5, 330, 180, 'Sorrina Westyr'),
    ];

    const paare = paareBildunterschriften([erstes, zweites], blocks);
    expect(paare.get(erstes)).toBe('Ella');
    expect(paare.get(zweites)).toBe('Sorrina Westyr');
  });

  it('laesst Unterschriften ausserhalb der Reichweite und anderer Seiten aus', () => {
    const bild = image(5, [150, 200, 300, 500]);
    const blocks = [
      text('caption', 4, 160, 180, 'Andere Seite'),
      text('caption', 5, 2000, 2000, 'Ausser Reichweite'),
    ];
    expect(paareBildunterschriften([bild], blocks).size).toBe(0);
  });
});

describe('isObject', () => {
  it('erkennt den Gegenstand an der Ausruestungszeile', () => {
    const flow = '**Items** locust dagger, *scroll of dispel magic*, leather armor';
    expect(isObject('Locust Dagger', flow)).toBe(true);
  });

  it('haelt eine Person fuer keine Sache', () => {
    // `Danbry` steht nirgends in einer Ausruestung — und ist eine Person.
    const flow = '**Items** dagger, rope **Perception** +7\n\nDanbry waits by the gate.';
    expect(isObject('Danbry', flow)).toBe(false);
  });
});

describe('nameImages', () => {
  it('sortiert nach Karte, Person und Gegenstand', () => {
    const blocks = [
      text('heading', 5, 72, 700, 'A. Karrenholt'),
      text('caption', 6, 100, 300, 'Danbry'),
      text('caption', 7, 100, 300, 'Locust Dagger'),
    ];
    const named = nameImages(
      [
        image(5, [40, 40, 560, 700], false),
        image(6, [90, 320, 300, 600]),
        image(7, [90, 320, 300, 600]),
      ],
      blocks,
      '**Items** locust dagger, rope',
    );

    expect(named.map((n) => [n.sort, n.file])).toEqual([
      ['karte', 'karrenholt'],
      ['person', 'danbry'],
      ['gegenstand', 'locust-dagger'],
    ]);
  });

  it('zaehlt gleiche Namen durch statt sie zu ueberschreiben', () => {
    // Zwei Bilder bei derselben Ueberschrift — eine Unterschrift wuerde nur
    // eines benennen (eins zu eins), eine Ueberschrift benennt beide.
    const blocks = [text('heading', 4, 100, 300, 'First Mate Marrowen')];
    const named = nameImages(
      [image(4, [90, 320, 300, 600]), image(4, [90, 320, 300, 600])],
      blocks,
      '',
    );
    expect(named.map((n) => n.file)).toEqual(['first-mate-marrowen', 'first-mate-marrowen-2']);
  });

  it('gibt die gepaarte Unterschrift exklusiv und laesst den Rest zurueckfallen', () => {
    // Die Lage von Seite 3 in 8-01: Inselkarte und Portraet, beide in
    // Reichweite der Unterschrift `Zarta Dralneen`. Das Portraet (näher)
    // bekommt sie; die Karte faellt auf den Kastentitel darueber zurueck,
    // statt sich denselben Namen zu nehmen.
    const inselkarte = image(3, [321, 361, 569, 534]);
    const portraet = image(3, [218, 294, 393, 582]);
    const blocks = [
      text('caption', 3, 251, 323, 'Zarta Dralneen'),
      text('box-heading', 3, 400, 639, 'WHERE ON GOLARION?'),
    ];

    const named = nameImages([inselkarte, portraet], blocks, '');
    expect(named.map((n) => n.file)).toEqual(['where-on-golarion', 'zarta-dralneen']);
  });

  it('behaelt die Seitenzahl, wenn kein Name dasteht', () => {
    expect(nameImages([image(7, [90, 320, 300, 600])], [], '')[0]!.file).toBe('s07');
  });
});
