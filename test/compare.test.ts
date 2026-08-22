import { describe, expect, it } from 'vitest';
import { normalise, readAloudsFrom, similarity } from '../src/pdf/compare.ts';

describe('normalise', () => {
  it('reduziert Foundry-Verweise auf ihren Anzeigetext', () => {
    expect(normalise('trifft @UUID[Actor.Eaa8]{Venture-Captain Brackett} an')).toBe(
      'trifft venture-captain brackett an',
    );
  });

  it('entfernt Wuerfelproben, die im PDF ausgeschrieben stehen', () => {
    expect(normalise('Versuche @Check[medicine|dc:18] darauf')).toBe('versuche darauf');
  });

  it('gleicht Anfuehrungszeichen und Auszeichnung an', () => {
    expect(normalise('<p>“It’s <strong>fine</strong>.”</p>')).toBe('"it\'s fine."');
  });
});

describe('similarity', () => {
  it('erkennt Gleichheit', () => {
    expect(similarity('der kasten steht hier', 'der kasten steht hier')).toBe(1);
  });

  it('faellt ab, wenn ein Kasten nur zur Haelfte erfasst ist', () => {
    const ganz = 'der vorlesetext laeuft ueber zwei spalten und endet erst spaeter';
    expect(similarity(ganz, 'der vorlesetext laeuft ueber')).toBeLessThan(0.9);
  });
});

describe('readAloudsFrom', () => {
  it('nimmt nur ausdruecklich markierten Vorlesetext', () => {
    const journal = {
      pages: [
        {
          text: {
            content:
              '<p>Fliesstext, der nicht zaehlt und lang genug ist um die Grenze zu reissen.</p>' +
              '<div class="read-aloud"><p>Der Kasten ist lang genug, um die Mindestlaenge zu ueberschreiten.</p></div>' +
              // Dieses Werkzeug setzt `blockquote`, die offiziellen Journale
              // `div` — gefunden werden muss beides.
              '<blockquote class="read-aloud"><p>Der zweite Kasten steht als blockquote da und ist ebenfalls lang genug.</p></blockquote>',
          },
        },
      ],
    };

    const boxes = readAloudsFrom(journal);

    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain('der kasten ist lang genug');
    expect(boxes[1]).toContain('steht als blockquote da');
  });
});
