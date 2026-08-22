import { describe, expect, it } from 'vitest';
import { detectDesignation, sanitisePathSegment } from '../src/pdf/season.ts';
import type { Block } from '../src/pdf/types.ts';

function block(text: string): Block {
  return { role: 'body', page: 1, column: 0, text, lines: [] };
}

describe('detectDesignation', () => {
  it('liest Season und Nummer aus dem Satz', () => {
    expect(detectDesignation([block('Pathfinder Society Scenario #8-01: Intro')])).toEqual({
      season: 8,
      scenario: 1,
    });
  });

  it('kommt auch ohne das Wort Scenario aus', () => {
    expect(detectDesignation([block('irgendwas'), block('#7-99 Levels 1–4')])).toEqual({
      season: 7,
      scenario: 99,
    });
  });

  it('gibt nichts zurueck, wenn keine Nummer im Satz steht', () => {
    expect(detectDesignation([block('Nur Fliesstext ohne Kennung')])).toBeUndefined();
  });
});

// Die Proben zu `seasonFolder`, `scenarioFolder` und `journalName` sind nicht
// verlorengegangen: die Namensgebung folgt in der Welt dem Schema von
// `showstopping_tools` und wird mit `src/world/naming.ts` neu geprueft.

describe('sanitisePathSegment', () => {
  it('ersetzt Zeichen, die im Dateisystem nicht zulaessig sind', () => {
    // Unter Windows ist der Doppelpunkt verboten.
    expect(sanitisePathSegment("Intro to the Year of Battle's Spark: Enough is Enough")).toBe(
      "Intro to the Year of Battle's Spark- Enough is Enough",
    );
  });

  it('entfernt Punkte und Leerzeichen am Ende', () => {
    expect(sanitisePathSegment('Ein Titel. ')).toBe('Ein Titel');
  });
});
