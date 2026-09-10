import { describe, expect, it } from 'vitest';
import {
  buildLines,
  dedupeRuns,
  isSidebarTitle,
  detectColumns,
  mergeBrokenParagraphs,
  renderBlock,
} from '../src/pdf/layout.ts';
import { groupBoxes } from '../src/pdf/boxes.ts';
import type { Block, BlockRole, TextRun } from '../src/pdf/types.ts';

function run(x: number, y: number, text: string, font = 'SabonLTStd-Roman'): TextRun {
  return {
    page: 1,
    x,
    y,
    // Genau genug fuer die Geometrie: 4,5 pt je Zeichen bei 9 pt Schrift.
    width: text.length * 4.5,
    size: 9,
    font,
    glyphs: [],
    text,
  };
}

function block(role: BlockRole, lines: TextRun[][]): Block {
  return {
    role,
    page: 1,
    column: 0,
    text: '',
    lines: lines.map((runs) => ({
      page: 1,
      column: 0,
      y: runs[0]!.y,
      x: runs[0]!.x,
      runs,
    })),
  };
}

describe('detectColumns', () => {
  it('trennt zwei Spalten trotz eines ueberbrueckenden Laufs', () => {
    const runs: TextRun[] = [];
    for (let i = 0; i < 20; i++) {
      runs.push(run(24, 700 - i * 12, 'x'.repeat(58)));
      runs.push(run(313, 700 - i * 12, 'x'.repeat(58)));
    }
    // Ein zentrierter, seitenbreiter Kastentitel ragt in den Bundsteg.
    runs.push(run(225, 350, 'x'.repeat(34), 'Ironstrike-Black'));

    const columns = detectColumns(runs, 603);

    expect(columns).toHaveLength(2);
    expect(columns[0]![0]).toBeCloseTo(24, 0);
    expect(columns[1]![0]).toBeGreaterThan(300);
  });

  it('laesst zentrierte Laeufe den Bundsteg nicht zuschuetten', () => {
    // Seite 3 von 8-06: Titel, Autorenzeile und die Unterschrift eines
    // mittig gesetzten Portraets sind alle kuerzer als die halbe Seite und
    // liegen zu dritt im Bundsteg — genau die Schwelle bei zwanzig Zeilen je
    // Spalte. Zentriert auf der Seitenmitte gehoeren sie keiner Spalte.
    const runs: TextRun[] = [];
    for (let i = 0; i < 20; i++) {
      runs.push(run(24, 700 - i * 12, 'x'.repeat(58)));
      runs.push(run(313, 700 - i * 12, 'x'.repeat(58)));
    }
    for (const [y, text] of [
      [727, 'x'.repeat(50)],
      [701, 'x'.repeat(26)],
      [65, 'x'.repeat(24)],
    ] as const) {
      const width = text.length * 4.5;
      runs.push(run(603 / 2 - width / 2, y, text));
    }

    const columns = detectColumns(runs, 603);

    expect(columns).toHaveLength(2);
    expect(columns[0]![0]).toBeCloseTo(24, 0);
    expect(columns[1]![0]).toBeGreaterThan(300);
  });

  it('erkennt eine einspaltige Seite', () => {
    const runs = Array.from({ length: 10 }, (_, i) => run(24, 700 - i * 12, 'x'.repeat(120)));

    expect(detectColumns(runs, 603)).toHaveLength(1);
  });
});

describe('buildLines', () => {
  it('haelt die Spalten auseinander und liest sie nacheinander', () => {
    const runs = [
      run(313, 700, 'rechts oben'),
      run(24, 700, 'links oben'),
      run(24, 688, 'links unten'),
      run(313, 688, 'rechts unten'),
    ];

    const lines = buildLines(runs, [
      [24, 295],
      [313, 602],
    ]);

    expect(lines.map((line) => line.runs[0]!.text)).toEqual([
      'links oben',
      'links unten',
      'rechts oben',
      'rechts unten',
    ]);
  });
});

describe('dedupeRuns', () => {
  it('entfernt uebereinander gesetzte Wiederholungen', () => {
    const runs = [run(100, 500, 'ISGER'), run(100.5, 500.5, 'ISGER'), run(200, 500, 'ISGER')];

    expect(dedupeRuns(runs)).toHaveLength(2);
  });
});

describe('renderBlock', () => {
  it('trennt Absaetze am Erstzeileneinzug', () => {
    const text = renderBlock(
      block('body', [
        [run(24, 700, 'Erster Absatz,')],
        [run(24, 688, 'zweite Zeile.')],
        [run(33, 676, 'Zweiter Absatz.')],
      ]),
    );

    expect(text).toBe('Erster Absatz, zweite Zeile.\n\nZweiter Absatz.');
  });

  it('haelt einen Absatz zusammen, der um eine Grafik laeuft', () => {
    // Die linke Kante wandert zeilenweise nach links — kein Absatzanfang.
    const text = renderBlock(
      block('body', [
        [run(24, 700, 'Anfang')],
        [run(417, 688, 'Mitte')],
        [run(409, 676, 'Ende.')],
      ]),
    );

    expect(text).toBe('Anfang Mitte Ende.');
  });

  it('behaelt den Bindestrich am Zeilenende, ohne Leerzeichen', () => {
    // In Season 6 bis 8 ist jeder Bindestrich am Zeilenende ein Kompositum.
    // Eine solche Zeile ist immer voll ausgesetzt, nie eine Schlusszeile.
    const text = renderBlock(
      block('body', [
        [run(24, 700, 'Sie begruesste den freundlichen brown-')],
        [run(24, 688, 'skinned gnome.')],
      ]),
    );

    expect(text).toBe('Sie begruesste den freundlichen brown-skinned gnome.');
  });

  it('behaelt echte Bindestriche', () => {
    const text = renderBlock(
      block('body', [[run(24, 700, 'Venture-')], [run(24, 688, 'Captain.')]]),
    );

    expect(text).toBe('Venture-Captain.');
  });

  it('haelt einen Absatz zusammen, dessen Zeilen um eine Grafik kurz bleiben', () => {
    // Umflossener Satz: jede Zeile ist kurz, aber keine endet einen Satz.
    const text = renderBlock(
      block('body', [
        [run(314, 700, 'x'.repeat(60))],
        [run(387, 688, 'Marrowen, meanwhile, does not join the fight. She')],
        [run(397, 676, 'keeps back and climbs down to the lower deck,')],
        [run(407, 664, 'hiding behind the winch.')],
      ]),
    );

    expect(text).toBe(
      `${'x'.repeat(60)} Marrowen, meanwhile, does not join the fight. ` +
        'She keeps back and climbs down to the lower deck, hiding behind the winch.',
    );
  });

  it('trennt am Einzug, obwohl der Absatzanfang um eine Grafik laeuft', () => {
    // Die ersten drei Zeilen umfliessen eine Grafik; die uebrigen stehen
    // buendig. Frueher schaltete die Streuung von 79 pt den Einzug ab, und
    // `Battered but Alive:` verlor seinen Absatzanfang.
    const text = renderBlock(
      block('body', [
        [run(393, 700, 'Development: The remaining smugglers were')],
        [run(381, 688, 'already thinking of abandoning the ship')],
        [run(314, 676, 'after their captain’s long run of bad luck.')],
        [run(314, 664, 'The stolen crates are in the ship’s hold.')],
        [run(323, 652, 'Battered but Alive: If the smugglers win,')],
        [run(314, 640, 'Captain Ashfell shakes off the rumors.')],
      ]),
    );

    expect(text).toBe(
      'Development: The remaining smugglers were already thinking of abandoning ' +
        'the ship after their captain’s long run of bad luck. ' +
        'The stolen crates are in the ship’s hold.\n\n' +
        'Battered but Alive: If the smugglers win, ' +
        'Captain Ashfell shakes off the rumors.',
    );
  });

  it('haelt eine verwackelte linke Kante fuer keinen Einzug', () => {
    // Die Zeilenanfaenge streuen um 14 pt und treffen das Einzugsband dabei
    // zufaellig. Ein gesetzter Einzug hat genau einen Wert — hier waere jede
    // zweite Zeile ein Absatzanfang.
    const text = renderBlock(
      block('body', [
        [run(312, 700, 'shape, the remaining PCs can attempt to catch it by,')],
        [run(324, 688, 'judgement, based on how the PCs describe attempts.')],
        [run(326, 676, 'Whatever approach they take, they must attempt a DC')],
        [run(325, 664, '16 check, and they need 2 successes to catch it.')],
        [run(313, 652, 'Each time a PC fails one of these checks, the shape')],
        [run(315, 640, 'lashes out at the PC causing the distraction.')],
      ]),
    );

    expect(text).toBe(
      'shape, the remaining PCs can attempt to catch it by, ' +
        'judgement, based on how the PCs describe attempts. ' +
        'Whatever approach they take, they must attempt a DC ' +
        '16 check, and they need 2 successes to catch it. ' +
        'Each time a PC fails one of these checks, the shape ' +
        'lashes out at the PC causing the distraction.',
    );
  });

  it('braucht eine wiederholte linke Kante', () => {
    // Vier Zeilen, vier verschiedene Anfaenge: hier gibt es keine Kante, an
    // der sich ein Einzug messen liesse. `1 Treasure / Bundle.` riss sonst
    // mitten im Satz auseinander.
    const text = renderBlock(
      block('body', [
        [run(321, 700, 'Rewards: If the PCs gain further support from one of')],
        [run(312, 688, 'the three guild masters, they earn 1 Treasure')],
        [run(320, 676, 'Bundle. If they win over two or more of these')],
        [run(338, 664, 'masters, they instead earn 2 Treasure Bundles.')],
      ]),
    );

    expect(text).toBe(
      'Rewards: If the PCs gain further support from one of ' +
        'the three guild masters, they earn 1 Treasure ' +
        'Bundle. If they win over two or more of these ' +
        'masters, they instead earn 2 Treasure Bundles.',
    );
  });

  it('eroeffnet keinen Absatz mitten im Satz, auch bei Einzug', () => {
    // Die ersten beiden Zeilen umfliessen eine Grafik; die dritte faellt mit
    // 5 pt zufaellig ins Einzugsband. Der vorige Satz laeuft aber weiter.
    const text = renderBlock(
      block('body', [
        [run(398, 700, 'The citadel’s upper keep consists')],
        [run(398, 688, 'of specialty rooms and smaller')],
        [run(317, 676, 'buildings. Unless otherwise stated, the stairs to the')],
        [run(312, 664, 'upper keep require 10 feet of movement.')],
      ]),
    );

    expect(text).toBe(
      'The citadel’s upper keep consists of specialty rooms and smaller ' +
        'buildings. Unless otherwise stated, the stairs to the ' +
        'upper keep require 10 feet of movement.',
    );
  });

  it('trennt am Erstzeileneinzug auch im Kasten', () => {
    // `Easier:`/`Harder:` sind zu lang, um als Schlusszeile aufzufallen —
    // nur der Einzug trennt sie.
    const text = renderBlock(
      block('box', [
        [run(326, 700, 'The difficulty can be adjusted in the following ways.')],
        [run(335, 688, 'Easier: Remove one porter.')],
        [run(335, 676, 'Harder: Remove the guard and add two more')],
        [run(326, 664, 'porters.')],
      ]),
    );

    expect(text).toBe(
      'The difficulty can be adjusted in the following ways.\n\n' +
        'Easier: Remove one porter.\n\n' +
        'Harder: Remove the guard and add two more porters.',
    );
  });

  it('haelt einen haengend gesetzten Eintrag zusammen', () => {
    // Hier ruecket die Fortsetzung ein, nicht der Absatzanfang: Zeile 2 endet
    // mitten im Satz und die naechste ist ebenfalls eingerueckt.
    const text = renderBlock(
      block('box', [
        [run(24, 700, 'Chase Points 4; Overcome DC 13 Acrobatics to slip through the gap.')],
        [run(33, 688, 'DC 17 Athletics to shove the barrels aside. DC 15 Intimidation to')],
        [run(33, 676, 'drive the onlookers out of your way.')],
      ]),
    );

    expect(text).toBe(
      'Chase Points 4; Overcome DC 13 Acrobatics to slip through the gap. ' +
        'DC 17 Athletics to shove the barrels aside. ' +
        'DC 15 Intimidation to drive the onlookers out of your way.',
    );
  });

  it('zeichnet Kursives im Fliesstext aus, in Ueberschriften nicht', () => {
    const italic = renderBlock(
      block('body', [[run(24, 700, 'siehe '), run(50, 700, 'Player Core', 'SabonLTStd-Italic')]]),
    );
    const heading = renderBlock(
      block('heading', [[run(24, 700, 'Adventure Background', 'Ironstrike-ExtraBold')]]),
    );

    expect(italic).toBe('siehe *Player Core*');
    expect(heading).toBe('Adventure Background');
  });
});

describe('isSidebarTitle', () => {
  /** Eine Kastenueberschrift mit echter Geometrie in Spalte [313, 602]. */
  function heading(x: number, text: string): Block {
    const line = { page: 7, column: 1, y: 663, x, runs: [run(x, 663, text, 'GoodOT-CondBold')] };
    return {
      role: 'box-heading',
      page: 7,
      column: 1,
      text,
      lines: [line],
      columnBounds: [313, 602],
    };
  }

  it('erkennt den mittigen Titel eines Sidebars', () => {
    expect(isSidebarTitle(heading(409, 'RUNNING A CHASE'))).toBe(true);
  });

  it('haelt einen buendigen Eintragstitel fuer keinen Sidebar', () => {
    expect(isSidebarTitle(heading(314, 'TWISTING ALLEYS OBSTACLE 1'))).toBe(false);
  });

  it('haelt einen Statblocktitel fuer keinen Sidebar', () => {
    // Weit rechts, fuellt seinen Kasten aber bis zum Rand — nicht zentriert.
    expect(isSidebarTitle(heading(418, 'DOCKHAND CREATURE 0 XXXXXXXXXXXXXXXXXXXXXX'))).toBe(false);
  });

  it('misst einen Titel mit Stufenangabe strenger', () => {
    // `WEAK CEUSTODAEMON CREATURE 5` steht in einem eingerueckten Statblock-
    // feld und wirkt dadurch mittig — 31 pt links, 72 pt rechts. Fuer eine
    // Eintragsleiste ist das zu schief; ohne Stufenangabe ginge es durch.
    const ranked = heading(344, 'WEAK CEUSTODAEMON CREATURE 5');
    ranked.lines[0]!.runs[0]!.width = 186;
    expect(isSidebarTitle(ranked)).toBe(false);

    const plain = heading(344, 'WEAK CEUSTODAEMON SIDEBAR');
    plain.lines[0]!.runs[0]!.width = 186;
    expect(isSidebarTitle(plain)).toBe(true);
  });

  it('laesst einen sauber zentrierten Titel mit Stufenangabe zu', () => {
    // `SCALING WAVE 1` ist ein echter Sidebar derselben Form — 99/122.
    const block = heading(412, 'SCALING WAVE 1');
    block.lines[0]!.runs[0]!.width = 68;
    expect(isSidebarTitle(block)).toBe(true);
  });

  it('urteilt ohne bekannte Spaltenkanten nicht', () => {
    const block = heading(409, 'RUNNING A CHASE');
    delete block.columnBounds;
    expect(isSidebarTitle(block)).toBe(false);
  });
});

describe('groupBoxes', () => {
  /** `bis` bildet einen mehrzeiligen Block ab, wie ihn ein Kasten hat. */
  function boxBlock(
    role: BlockRole,
    page: number,
    column: number,
    y: number,
    bis = y,
  ): Block {
    const lines = [];
    for (let at = y; at >= bis; at -= 12) lines.push({ page, column, y: at, x: 24, runs: [] });
    return { role, page, column, text: `${role}@${y}`, lines };
  }

  it('fasst Titel, Merkmale und Text eines Kastens zusammen', () => {
    const groups = groupBoxes([
      boxBlock('box-heading', 5, 1, 651),
      boxBlock('box', 5, 1, 639, 591),
      boxBlock('traits', 5, 1, 554),
      boxBlock('box', 5, 1, 542, 506),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.parts).toHaveLength(4);
    expect(groups[0]!.indices).toEqual([0, 1, 2, 3]);
    expect(groups[0]!.title).toBe('box-heading@651');
  });

  it('trennt Kaesten verschiedener Spalten', () => {
    // Eine Tabelle unten links darf den Kasten oben rechts nicht anziehen.
    const groups = groupBoxes([
      boxBlock('box-heading', 5, 0, 195),
      boxBlock('box', 5, 0, 183),
      boxBlock('box-heading', 5, 1, 651),
      boxBlock('box', 5, 1, 639),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.title)).toEqual(['box-heading@195', 'box-heading@651']);
  });

  it('laesst eine Ueberschrift ohne Kastentext im Fliesstext', () => {
    expect(groupBoxes([boxBlock('box-heading', 5, 0, 195)])).toHaveLength(0);
  });

  it('laesst die Bloecke des Szenarios unveraendert', () => {
    // `groupBoxes` naeht einen umbrochenen Kasten zusammen. Schriebe es dabei
    // in den Block selbst, saehe ein zweiter Aufruf einen anderen Stand — das
    // Journal wird zweimal gebaut (mit und ohne Actor-Verweise), und der
    // Vorlesetext stand dann in der zweiten Fassung doppelt da.
    const blocks = [
      boxBlock('box', 7, 0, 651, 627),
      boxBlock('box', 7, 1, 615, 591),
    ];
    blocks[0]!.text = 'Der Satz beginnt hier und';
    blocks[1]!.text = 'laeuft in der naechsten Spalte weiter.';
    const vorher = blocks.map((block) => block.text);

    const ersteFassung = groupBoxes(blocks);
    expect(blocks.map((block) => block.text)).toEqual(vorher);

    const zweiteFassung = groupBoxes(blocks);
    expect(zweiteFassung.map((d) => d.parts.map((p) => p.text))).toEqual(
      ersteFassung.map((d) => d.parts.map((p) => p.text)),
    );
  });

  it('haelt einen Kasten ueber seine Erfolgsstufenliste hinweg zusammen', () => {
    // `RUNNING A CHASE` riss frueher am `check-result` ab, verlor damit seinen
    // Vorlesetext und landete als blosse Ueberschrift im Fliesstext.
    const groups = groupBoxes([
      boxBlock('box-heading', 7, 1, 651),
      boxBlock('check-result', 7, 1, 639, 591),
      boxBlock('box', 7, 1, 579, 543),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('box-heading@651');
    expect(groups[0]!.parts).toHaveLength(3);
  });

  /** Wie `boxBlock`, aber mit Spaltenkanten und echter Titelgeometrie. */
  function titled(x: number, text: string, y: number): Block {
    const line = { page: 7, column: 1, y, x, runs: [run(x, y, text, 'GoodOT-CondBold')] };
    return {
      role: 'box-heading',
      page: 7,
      column: 1,
      text,
      lines: [line],
      columnBounds: [313, 602],
    };
  }

  it('trennt Eintraege mit buendigem Titel voneinander', () => {
    // Vier Hindernisse nacheinander sind vier Kaesten, nicht einer mit drei
    // Aktivitaeten darin.
    const groups = groupBoxes([
      titled(314, 'INTO THE DRINK OBSTACLE 1', 651),
      boxBlock('box', 7, 1, 639, 615),
      titled(314, 'TWISTING ALLEYS OBSTACLE 1', 591),
      boxBlock('box', 7, 1, 579, 555),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.sidebar)).toEqual([false, false]);
  });

  it('nimmt eine Aktivitaet nur in einen Sidebar auf', () => {
    const groups = groupBoxes([
      titled(409, 'GUIDING CIVILIANS', 651),
      boxBlock('box', 7, 1, 639, 615),
      titled(322, 'GUIDE CIVILIANS', 591),
      boxBlock('box', 7, 1, 579, 555),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.sidebar).toBe(true);
    expect(groups[0]!.parts).toHaveLength(4);
  });

  it('gibt dem folgenden Kasten seinen Titel, statt ihn zu verschlucken', () => {
    // Versprengter Vorlesetext ueber einem Kastentitel: der Titel eroeffnet
    // einen neuen Kasten, statt als Aktivitaet im titellosen zu verschwinden.
    const groups = groupBoxes([
      boxBlock('box', 7, 1, 651, 627),
      boxBlock('box-heading', 7, 1, 615),
      boxBlock('box', 7, 1, 603, 567),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.title)).toEqual([undefined, 'box-heading@615']);
  });
});

describe('detectColumns — seitenbreite Banner', () => {
  it('laesst sich vom Titelbanner den Bundsteg nicht zuschuetten', () => {
    const runs: TextRun[] = [];
    // Ein voller Satzspiegel, wie ihn eine Textseite hat.
    for (let i = 0; i < 45; i++) {
      runs.push(run(24, 620 - i * 12, 'x'.repeat(58)));
      runs.push(run(325, 620 - i * 12, 'x'.repeat(58)));
    }
    // Doppelt gezeichnetes Titelbanner ueber die halbe Seite, plus Autorzeile.
    runs.push(run(125, 700, 'x'.repeat(79), 'BeryliumBold'));
    runs.push(run(125, 700.5, 'x'.repeat(79), 'BeryliumBold'));
    runs.push(run(248, 680, 'x'.repeat(24), 'GoodOT-CondBold'));
    runs.push(run(248, 680.5, 'x'.repeat(24), 'GoodOT-CondBold'));

    expect(detectColumns(runs, 603)).toHaveLength(2);
  });
});

describe('renderBlock — Absaetze im Kastentext', () => {
  it('trennt am Ende einer kurzen Zeile', () => {
    // Vorlesekaesten sind zentriert; ein Einzug ist dort nicht moeglich.
    const text = renderBlock(
      block('box', [
        [run(325, 327, 'x'.repeat(44))],
        [run(325, 315, 'x'.repeat(44))],
        [run(325, 303, 'kurze Schlusszeile.')],
        [run(325, 291, 'y'.repeat(44))],
      ]),
    );

    expect(text.split('\n\n')).toHaveLength(2);
    expect(text.split('\n\n')[1]).toBe('y'.repeat(44));
  });

  it('trennt nicht, solange die Zeilen die Messbreite fuellen', () => {
    const text = renderBlock(
      block('box', [
        [run(325, 327, 'x'.repeat(44))],
        [run(325, 315, 'x'.repeat(43))],
        [run(325, 303, 'x'.repeat(44))],
      ]),
    );

    expect(text.split('\n\n')).toHaveLength(1);
  });
});

describe('mergeBrokenParagraphs', () => {
  function textBlock(role: BlockRole, page: number, text: string): Block {
    return { role, page, column: 0, text, lines: [] };
  }

  it('fuegt einen Satz zusammen, den ein Sidebar-Kasten zerschnitten hat', () => {
    const merged = mergeBrokenParagraphs([
      textBlock('body', 5, '**Creatures:** Marrowen orders the rest to slow them down,'),
      textBlock('box-heading', 5, 'ADJUSTING DIFFICULTY'),
      textBlock('box', 5, 'The difficulty of encounter A can be adjusted.'),
      textBlock('body', 5, 'giving the skiff more time to get away.'),
    ]);

    expect(merged).toHaveLength(3);
    expect(merged[0]!.text).toContain('slow them down, giving the skiff more time');
  });

  it('zaehlt Kartenbeschriftungen nicht gegen das Budget', () => {
    // Zwischen den Satzhaelften kann eine ganze Kartenseite liegen.
    const merged = mergeBrokenParagraphs([
      textBlock('body', 5, 'The agents insist the smugglers took them by surprise, and'),
      ...Array.from({ length: 7 }, (_, i) => textBlock('map-label', 6, `LABEL ${i}`)),
      textBlock('body', 7, 'they know they have let the guild down.'),
    ]);

    expect(merged[0]!.text).toContain('by surprise, and they know they have let');
  });

  it('naeht einen Vorlesetext ueber einen Seitenkasten hinweg', () => {
    // 8-01, Event 4: Zwischen den beiden Haelften des Vorlesetextes steht der
    // Kasten ADJUSTING DIFFICULTY — derselben Rolle, aber abgeschlossen.
    const merged = mergeBrokenParagraphs([
      textBlock('box', 6, 'Furniture around the room starts to rattle,'),
      textBlock('caption', 6, 'The Brass Compass'),
      textBlock('box-heading', 6, 'ADJUSTING DIFFICULTY'),
      textBlock('box', 6, 'You can adjust the difficulty of Event 4.'),
      textBlock('box', 6, 'tipping glassware onto the floor.'),
    ]);

    expect(merged).toHaveLength(4);
    expect(merged[0]!.text).toBe(
      'Furniture around the room starts to rattle, tipping glassware onto the floor.',
    );
  });

  it('naeht mitten in einer Auszeichnung ohne zweites Sternchenpaar', () => {
    // Sonst wuerde aus `*singing brass bell*` ein
    // `*singing brass* *bell*` — zwei Auszeichnungen statt einer.
    const merged = mergeBrokenParagraphs([
      textBlock('body', 6, 'The powerful resonance of the *singing brass*'),
      textBlock('caption', 6, 'Mira'),
      textBlock('body', 9, '*bell* creates these portals.'),
    ]);

    expect(merged[0]!.text).toBe(
      'The powerful resonance of the *singing brass bell* creates these portals.',
    );
  });

  it('laesst zwei abgeschlossene Kaesten getrennt', () => {
    // Der Vorlesekasten-Fall darf nicht dazu fuehren, dass Kaesten wahllos
    // zusammenlaufen: Der zweite beginnt gross.
    const merged = mergeBrokenParagraphs([
      textBlock('box', 6, 'Ein Kasten, der zu Ende ist.'),
      textBlock('box', 6, 'Ein zweiter Kasten.'),
    ]);

    expect(merged).toHaveLength(2);
  });

  it('laesst einen abgeschlossenen Satz in Ruhe', () => {
    const merged = mergeBrokenParagraphs([
      textBlock('body', 5, 'Der Satz ist zu Ende.'),
      textBlock('body', 5, 'ein neuer Absatz beginnt klein.'),
    ]);

    expect(merged).toHaveLength(2);
  });

  it('naeht nicht ueber eine Ueberschrift hinweg', () => {
    const merged = mergeBrokenParagraphs([
      textBlock('body', 5, 'Ein abgerissener Satzteil ohne'),
      textBlock('heading', 5, 'Neuer Abschnitt'),
      textBlock('body', 5, 'punkt geht es weiter.'),
    ]);

    expect(merged).toHaveLength(3);
  });
});

describe('renderBlock — zentrierter Fliesstext', () => {
  it('nutzt den Einzug nicht, wenn die linke Kante stark schwankt', () => {
    // Begegnungstext ist zentriert; jeder Einzug ist dort Zufall.
    const text = renderBlock(
      block('body', [
        [run(408, 700, 'x'.repeat(40))],
        [run(395, 688, 'x'.repeat(43))],
        [run(369, 676, 'x'.repeat(48))],
      ]),
    );

    expect(text.split('\n\n')).toHaveLength(1);
  });
});
