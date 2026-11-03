/**
 * MD5 de um texto (em UTF-8), em hexadecimal. O Biber marca nomes e listas de
 * nomes com o MD5 deles no .bbl (o biblatex compara esses valores para saber
 * se dois autores são os mesmos); aqui ele serve só para reproduzir esses
 * valores, não para segurança.
 */

const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // Mensagem + 0x80 + zeros + tamanho em bits (64 bits, little-endian), em blocos de 64 bytes.
  const length = ((bytes.length + 8) >>> 6) * 64 + 64;
  const data = new Uint8Array(length);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(length - 8, (bytes.length * 8) >>> 0, true);
  view.setUint32(length - 4, Math.floor(bytes.length / 2 ** 29), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + CONSTANTS[i]! + words[g]!) >>> 0;
      const shift = SHIFTS[(i >>> 4) * 4 + (i % 4)]!;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((word, i) => out.setUint32(i * 4, word, true));
  return [...new Uint8Array(out.buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
