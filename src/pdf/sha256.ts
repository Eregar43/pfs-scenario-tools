/**
 * SHA-256, synchron.
 *
 * Warum nicht `crypto.subtle.digest`: Die Kennungen der Journalseiten werden
 * aus ihrem Namen abgeleitet (`journal.ts::foundryId`), damit zwei Laeufe
 * dieselben Kennungen ergeben und ein zweiter Import die Seiten wiedererkennt.
 * `crypto.subtle` ist asynchron — `foundryId` wuerde damit `async`, und mit
 * ihm `buildJournal`, `boxHtml`, `statblockHtml` und alles, was die aufrufen.
 * Eine Welle asynchroner Signaturen quer durch die reine Logik, nur um einen
 * Hash zu bilden.
 *
 * Es muss ausserdem **byteweise dasselbe** herauskommen wie bei Nodes
 * `createHash('sha256')` im Extractor, sonst weichen die Seitenkennungen ab
 * und der Vergleich gegen dessen `journal.json` schlaegt fehl. Deshalb die
 * Proben gegen die NIST-Vektoren in `test/sha256.test.ts`.
 *
 * Umsetzung nach FIPS 180-4, ohne Kniffe.
 */

/** Die ersten 32 Bit der Nachkommastellen der Kubikwurzeln der ersten 64 Primzahlen. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Die ersten 32 Bit der Nachkommastellen der Wurzeln der ersten acht Primzahlen. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Rohbytes hinein, 32 Bytes Streuwert heraus. */
export function sha256(data: Uint8Array): Uint8Array {
  // Anhaengen: eine Eins, dann Nullen bis 56 mod 64, dann die Laenge in Bit
  // als 64-Bit-Zahl.
  const bitLength = data.length * 8;
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) << 6);
  padded.set(data);
  padded[data.length] = 0x80;

  const view = new DataView(padded.buffer);
  // Die oberen 32 Bit der Laenge: erst jenseits von 512 MB ungleich null,
  // fuer ein PDF also praktisch nie — der Vollstaendigkeit halber trotzdem.
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  const h = H0.slice();
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) out.setUint32(i * 4, h[i]!, false);
  return digest;
}

/** Zeichenkette hinein (als UTF-8 gelesen), 32 Bytes Streuwert heraus. */
export function sha256OfText(text: string): Uint8Array {
  return sha256(new TextEncoder().encode(text));
}

/** Streuwert als Hexziffern — die uebliche Schreibweise beim Vergleichen. */
export function sha256Hex(data: Uint8Array): string {
  return Array.from(sha256(data), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
