/**
 * A small synchronous zlib/raw DEFLATE decoder (RFC 1950/1951), enough to
 * read cross-reference streams and object streams of a saved file. Throws on
 * malformed input.
 */

class Tree {
  readonly counts = new Uint16Array(16);
  readonly symbols = new Uint16Array(288);
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function buildTree(tree: Tree, lengths: ArrayLike<number>, offset: number, count: number): void {
  tree.counts.fill(0);
  for (let i = 0; i < count; i++) tree.counts[lengths[offset + i]]++;
  tree.counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 0, sum = 0; i < 16; i++) {
    offs[i] = sum;
    sum += tree.counts[i];
  }
  for (let i = 0; i < count; i++) {
    const len = lengths[offset + i];
    if (len) tree.symbols[offs[len]++] = i;
  }
}

class Reader {
  pos: number;
  private bitBuf = 0;
  private bitCount = 0;
  out: Uint8Array;
  outLen = 0;

  constructor(
    readonly src: Uint8Array,
    start: number,
  ) {
    this.pos = start;
    this.out = new Uint8Array(Math.max(1024, src.length * 4));
  }

  bit(): number {
    if (this.bitCount === 0) {
      if (this.pos >= this.src.length) throw new Error('inflate: unexpected end of data');
      this.bitBuf = this.src[this.pos++];
      this.bitCount = 8;
    }
    const b = this.bitBuf & 1;
    this.bitBuf >>>= 1;
    this.bitCount--;
    return b;
  }

  bits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.bit() << i;
    return v;
  }

  alignByte(): void {
    this.bitCount = 0;
  }

  decode(tree: Tree): number {
    let sum = 0;
    let cur = 0;
    let len = 0;
    do {
      cur = 2 * cur + this.bit();
      len++;
      if (len > 15) throw new Error('inflate: bad code');
      sum += tree.counts[len];
      cur -= tree.counts[len];
    } while (cur >= 0);
    return tree.symbols[sum + cur];
  }

  push(b: number): void {
    if (this.outLen === this.out.length) {
      const grown = new Uint8Array(this.out.length * 2);
      grown.set(this.out);
      this.out = grown;
    }
    this.out[this.outLen++] = b;
  }
}

const FIXED_LIT = new Tree();
const FIXED_DIST = new Tree();
{
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  buildTree(FIXED_LIT, l, 0, 288);
  buildTree(FIXED_DIST, new Uint8Array(30).fill(5), 0, 30);
}

function inflateBlock(r: Reader, lit: Tree, dist: Tree): void {
  for (;;) {
    const sym = r.decode(lit);
    if (sym === 256) return;
    if (sym < 256) {
      r.push(sym);
      continue;
    }
    const li = sym - 257;
    if (li >= 29) throw new Error('inflate: bad length');
    const length = LENGTH_BASE[li] + r.bits(LENGTH_EXTRA[li]);
    const di = r.decode(dist);
    if (di >= 30) throw new Error('inflate: bad distance');
    const distance = DIST_BASE[di] + r.bits(DIST_EXTRA[di]);
    if (distance > r.outLen) throw new Error('inflate: distance too far');
    for (let i = 0; i < length; i++) r.push(r.out[r.outLen - distance]);
  }
}

function dynamicTrees(r: Reader, lit: Tree, dist: Tree): void {
  const hlit = r.bits(5) + 257;
  const hdist = r.bits(5) + 1;
  const hclen = r.bits(4) + 4;
  const lengths = new Uint8Array(288 + 32);
  for (let i = 0; i < hclen; i++) lengths[CL_ORDER[i]] = r.bits(3);
  const codeTree = new Tree();
  buildTree(codeTree, lengths, 0, 19);
  lengths.fill(0, 0, 19);
  for (let n = 0; n < hlit + hdist; ) {
    const sym = r.decode(codeTree);
    if (sym < 16) {
      lengths[n++] = sym;
      continue;
    }
    let prev = 0;
    let repeat: number;
    if (sym === 16) {
      if (n === 0) throw new Error('inflate: bad repeat');
      prev = lengths[n - 1];
      repeat = 3 + r.bits(2);
    } else if (sym === 17) {
      repeat = 3 + r.bits(3);
    } else {
      repeat = 11 + r.bits(7);
    }
    if (n + repeat > hlit + hdist) throw new Error('inflate: bad lengths');
    while (repeat--) lengths[n++] = prev;
  }
  buildTree(lit, lengths, 0, hlit);
  buildTree(dist, lengths, hlit, hdist);
}

/** Inflate zlib-wrapped (or, when the header is absent, raw) DEFLATE data. */
export function inflate(data: Uint8Array): Uint8Array {
  let start = 0;
  if (data.length >= 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0) {
    start = 2;
  }
  const r = new Reader(data, start);
  const lit = new Tree();
  const dist = new Tree();
  let final = 0;
  do {
    final = r.bit();
    const type = r.bits(2);
    if (type === 0) {
      r.alignByte();
      if (r.pos + 4 > data.length) throw new Error('inflate: truncated stored block');
      const len = data[r.pos] | (data[r.pos + 1] << 8);
      r.pos += 4;
      if (r.pos + len > data.length) throw new Error('inflate: truncated stored block');
      for (let i = 0; i < len; i++) r.push(data[r.pos++]);
    } else if (type === 1) {
      inflateBlock(r, FIXED_LIT, FIXED_DIST);
    } else if (type === 2) {
      dynamicTrees(r, lit, dist);
      inflateBlock(r, lit, dist);
    } else {
      throw new Error('inflate: bad block type');
    }
  } while (!final);
  return r.out.subarray(0, r.outLen);
}
