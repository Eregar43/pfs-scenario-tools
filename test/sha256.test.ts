import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256OfText } from '../src/pdf/sha256.ts';

function hex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Diese Funktion ersetzt Nodes `createHash('sha256')` aus dem Extractor. Sie
 * muss byteweise dasselbe liefern, sonst weichen die Kennungen der
 * Journalseiten ab und der Vergleich gegen dessen `journal.json` schlaegt
 * fehl. Geprueft wird deshalb gegen die veroeffentlichten Vektoren, nicht
 * gegen eine zweite eigene Rechnung.
 */
describe('sha256', () => {
  it('trifft den Vektor fuer die leere Eingabe', () => {
    expect(hex(sha256OfText(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('trifft die NIST-Vektoren', () => {
    expect(hex(sha256OfText('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      hex(sha256OfText('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('kommt ueber die Blockgrenze hinweg', () => {
    // 56 Zeichen: genau die Laenge, bei der die Laengenangabe nicht mehr in
    // den ersten Block passt und ein zweiter Block noetig wird. Hier bricht
    // eine falsch gerechnete Auffuellung als erstes.
    expect(hex(sha256OfText('a'.repeat(56)))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(hex(sha256OfText('a'.repeat(63)))).toBe(
      '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34',
    );
    expect(hex(sha256OfText('a'.repeat(64)))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
    expect(hex(sha256OfText('a'.repeat(1000)))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  it('liest Zeichen jenseits von ASCII als UTF-8', () => {
    // Ein Umlaut sind zwei Bytes. Wer die Zeichenkette zeichenweise nimmt,
    // rechnet hier etwas anderes aus — und Szenariotitel tragen Apostrophe
    // und Gedankenstriche, die genauso mehrbytig sind.
    expect(hex(sha256OfText('ä'))).toBe(
      '33e6d73fee82904c8d7afb78de1154d1e8dc2a0edb08120e63df5b9385c2d9cc',
    );
  });

  it('verarbeitet Rohbytes einschliesslich Null und 255', () => {
    expect(sha256Hex(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe(
      '3f2d1552cdc7483f40dd720c80b900225dfecfd5cae7cd168d79ab6ee5959885',
    );
  });
});
