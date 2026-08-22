import { describe, expect, it } from 'vitest';
import { defaultColorFor, gleicheFarbe, officialColorFor } from '../src/world/colors.ts';
import {
  journalName,
  passtZuSeason,
  quellenangabe,
  scenarioFolderName,
  scenarioKey,
  schluesselAusOrdnername,
  seasonFolderName,
} from '../src/world/naming.ts';

/**
 * Diese Namen sind kein Geschmack, sondern eine Schnittstelle: das Makro
 * "Build PFS Adventures" in `showstopping_tools` liest genau sie. Passt eine
 * Zeichenkette nicht, findet es die Inhalte nicht mehr.
 */
describe('seasonFolderName', () => {
  it('setzt Nummer und Jahrgangsnamen zusammen', () => {
    expect(seasonFolderName(8)).toBe('Season 8 - Year of Clockwork Mystery');
    expect(seasonFolderName(7)).toBe("Season 7 - Year of Battle's Spark");
  });

  it('kommt ohne Namen aus, wenn der Jahrgang unbekannt ist', () => {
    // Season 9 gibt es noch nicht — dann bleibt wenigstens die Nummer, und die
    // Erkennung drueben greift weiter.
    expect(seasonFolderName(9)).toBe('Season 9');
  });
});

describe('scenarioFolderName', () => {
  it('setzt die Nummer ungepaddet und trennt mit einem Leerzeichen', () => {
    // Genau diese Form verlangt SCENARIO_RE in showstopping_tools:
    // /^(\d+)\s*-\s*(\d+)\s+(.+)$/
    expect(scenarioFolderName({ season: 8, scenario: 1 }, 'Intro to the Year')).toBe(
      '8-01 Intro to the Year',
    );
    expect(scenarioFolderName({ season: 8, scenario: 99 }, 'The Kaiju Crisis')).toBe(
      '8-99 The Kaiju Crisis',
    );
  });

  it('entschaerft Zeichen, die in einem Ordnernamen stoeren', () => {
    expect(
      scenarioFolderName({ season: 7, scenario: 0 }, "Enough is Enough: Part 1"),
    ).toBe('7-00 Enough is Enough- Part 1');
  });
});

describe('scenarioKey', () => {
  it('paddet beide Zahlen', () => {
    expect(scenarioKey({ season: 8, scenario: 1 })).toBe('08-01');
    expect(scenarioKey({ season: 10, scenario: 12 })).toBe('10-12');
  });
});

describe('journalName', () => {
  it('heisst voreingestellt wie der Ordner', () => {
    expect(journalName({ season: 8, scenario: 1 }, 'Intro to the Year')).toBe(
      '8-01 Intro to the Year',
    );
  });

  it('folgt auf Wunsch der Schreibweise der Abenteuer', () => {
    expect(journalName({ season: 8, scenario: 1 }, 'Intro to the Year', 'pfs')).toBe(
      'PFS #08-01 - Intro to the Year',
    );
  });

  it('bleibt beim Titel, wenn keine Kennung gefunden wurde', () => {
    expect(journalName(undefined, 'Irgendein Heft')).toBe('Irgendein Heft');
  });
});

describe('passtZuSeason', () => {
  it('erkennt den Ordner mit und ohne Zusatz', () => {
    expect(passtZuSeason('Season 8', 8)).toBe(true);
    expect(passtZuSeason('Season 8 - Year of Clockwork Mystery', 8)).toBe(true);
    expect(passtZuSeason('season 8', 8)).toBe(true);
  });

  it('verwechselt Season 8 nicht mit Season 80', () => {
    expect(passtZuSeason('Season 80', 8)).toBe(false);
    expect(passtZuSeason('Season 1', 8)).toBe(false);
  });
});

describe('schluesselAusOrdnername', () => {
  it('liest gepaddete wie ungepaddete Schreibweise', () => {
    expect(schluesselAusOrdnername('8-01 Titel')).toBe('08-01');
    expect(schluesselAusOrdnername('08-01 Titel')).toBe('08-01');
    expect(schluesselAusOrdnername('8 - 1 Titel')).toBe('08-01');
  });

  it('gibt nichts zurueck, wenn der Name nicht passt', () => {
    expect(schluesselAusOrdnername('Irgendein Ordner')).toBeUndefined();
    expect(schluesselAusOrdnername('8-01')).toBeUndefined();
  });
});

describe('Farben', () => {
  it('kennt Paizos Hausfarben', () => {
    expect(officialColorFor(7)).toBe('#246865');
    expect(officialColorFor(8)).toBeUndefined();
  });

  it('greift sonst auf die Palette zurueck', () => {
    expect(defaultColorFor(1)).toBe('#c0392b');
    expect(defaultColorFor(7)).toBe('#246865');
    expect(defaultColorFor(8)).toBe('#a04000');
    // Neunter Jahrgang faengt die Palette von vorn an.
    expect(defaultColorFor(9)).toBe('#c0392b');
  });

  it('vergleicht Farben auch als Color-Objekt', () => {
    // Folder#color ist seit v13 ein Objekt, kein String. Ein direkter
    // Vergleich gegen "#246865" waere immer falsch.
    const alsObjekt = { toString: () => '#246865' };
    expect(gleicheFarbe(alsObjekt, '#246865')).toBe(true);
    expect(gleicheFarbe(alsObjekt, '#000000')).toBe(false);
    expect(gleicheFarbe(null, null)).toBe(true);
    expect(gleicheFarbe(null, '#246865')).toBe(false);
  });
});

describe('quellenangabe', () => {
  it('schreibt das Heft so, wie die Season-Module es tun', () => {
    // Abgelesen an den Kreaturen des Season-7-Moduls in der laufenden Welt:
    // Season ungepaddet, Szenarionummer gepaddet, Doppelpunkt vor dem Titel.
    expect(quellenangabe({ season: 8, scenario: 4 }, 'A Theft in Harborgate')).toBe(
      'Pathfinder Society Scenario #8-04: A Theft in Harborgate',
    );
    expect(quellenangabe({ season: 10, scenario: 14 }, 'Titel')).toBe(
      'Pathfinder Society Scenario #10-14: Titel',
    );
  });
});
