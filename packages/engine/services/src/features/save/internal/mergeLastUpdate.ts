/**
 * Merge an incremental save into the file's last update section.
 *
 * An incremental save appends one update section (objects, cross-reference
 * section, trailer) to the loaded bytes. Saving the same file again and again
 * stacks one section per save. `mergeIntoLastUpdate` instead folds the new
 * section into the loaded file's last update section: the result holds the
 * bytes before that section unchanged, followed by ONE section with every
 * object of the old last section that is still in use and every object of
 * the new save (newer wins), chained to the old section's `/Prev`.
 *
 * The last section is identified from the standard structure only: the final
 * `startxref` → its cross-reference table or stream (with a hybrid
 * `/XRefStm`) → its `/Prev`, which must be the `startxref` of the revision
 * ending right before the section. Whenever that cannot be proven — no
 * previous revision, a linearized or broken file, a section with a
 * signature (`/ByteRange`), an unexpected save layout — the incremental save
 * is returned unchanged (a plain append). Later saves then merge into that
 * appended section.
 *
 * Object bytes are copied verbatim with their object numbers, so encrypted
 * objects stay correctly encrypted. Object streams of the old section are
 * kept as long as one of their objects is still in use.
 */
import { inflate } from './inflate';

type Entry =
  | { type: 0; gen: number }
  | { type: 1; offset: number; gen: number }
  | { type: 2; stm: number; idx: number };

interface Ref {
  ref: [number, number];
}
interface Name {
  name: string;
}
type PdfValue =
  | number
  | boolean
  | null
  | string
  | Name
  | Ref
  | PdfValue[]
  | Map<string, PdfValue>
  | { keyword: string };

interface XrefSection {
  kind: 'table' | 'stream';
  /** Where the section's xref table or xref stream object starts. */
  offset: number;
  entries: Map<number, Entry>;
  trailer: Map<string, PdfValue>;
  /** The object number of the xref stream (kind `stream`). */
  objNum?: number;
}

const isWS = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 ||
  c === 0x29 ||
  c === 0x3c ||
  c === 0x3e ||
  c === 0x5b ||
  c === 0x5d ||
  c === 0x7b ||
  c === 0x7d ||
  c === 0x2f ||
  c === 0x25;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

function latin1(bytes: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(to, i + 8192)));
  }
  return s;
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

class Unproven extends Error {}

function fail(why: string): never {
  throw new Unproven(why);
}

/** A minimal PDF object lexer/parser over raw bytes. */
class Parser {
  constructor(
    readonly b: Uint8Array,
    public pos: number,
  ) {}

  skipWS(): void {
    const b = this.b;
    while (this.pos < b.length) {
      const c = b[this.pos];
      if (isWS(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  private regular(): string {
    const start = this.pos;
    while (this.pos < this.b.length && !isWS(this.b[this.pos]) && !isDelim(this.b[this.pos]))
      this.pos++;
    return latin1(this.b, start, this.pos);
  }

  /** Peek whether the next tokens are `int int <kw>` without consuming them. */
  private peekIntIntKeyword(kw: string): boolean {
    const save = this.pos;
    try {
      this.skipWS();
      const a = this.regular();
      this.skipWS();
      const g = this.regular();
      this.skipWS();
      const k = this.regular();
      return /^\d+$/.test(a) && /^\d+$/.test(g) && k === kw;
    } finally {
      this.pos = save;
    }
  }

  value(depth = 0): PdfValue {
    if (depth > 200) fail('nesting too deep');
    this.skipWS();
    const b = this.b;
    if (this.pos >= b.length) fail('unexpected end');
    const c = b[this.pos];
    if (c === 0x2f) {
      this.pos++;
      return { name: this.regular() };
    }
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        const dict = new Map<string, PdfValue>();
        for (;;) {
          this.skipWS();
          if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
            this.pos += 2;
            return dict;
          }
          const key = this.value(depth + 1);
          if (typeof key !== 'object' || key === null || !('name' in key))
            fail('bad dictionary key');
          dict.set((key as Name).name, this.value(depth + 1));
        }
      }
      const end = b.indexOf(0x3e, this.pos);
      if (end < 0) fail('unterminated hex string');
      const s = latin1(b, this.pos, end + 1);
      this.pos = end + 1;
      return s;
    }
    if (c === 0x5b) {
      this.pos++;
      const arr: PdfValue[] = [];
      for (;;) {
        this.skipWS();
        if (b[this.pos] === 0x5d) {
          this.pos++;
          return arr;
        }
        arr.push(this.value(depth + 1));
      }
    }
    if (isDelim(c)) fail('unexpected delimiter');
    if (isDigit(c) && this.peekIntIntKeyword('R')) {
      const num = Number(this.regular());
      this.skipWS();
      const gen = Number(this.regular());
      this.skipWS();
      this.regular();
      return { ref: [num, gen] };
    }
    const tok = this.regular();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return Number(tok);
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    if (tok === '') fail('empty token');
    return { keyword: tok };
  }

  private literalString(): string {
    const b = this.b;
    const start = this.pos;
    let depth = 0;
    for (; this.pos < b.length; this.pos++) {
      const c = b[this.pos];
      if (c === 0x5c) this.pos++;
      else if (c === 0x28) depth++;
      else if (c === 0x29 && --depth === 0) {
        this.pos++;
        return latin1(b, start, this.pos);
      }
    }
    return fail('unterminated string');
  }

  keyword(): string {
    this.skipWS();
    return this.regular();
  }

  /** `num gen obj` at the current position; returns [num, gen]. */
  objHeader(): [number, number] {
    const num = this.keyword();
    const gen = this.keyword();
    const kw = this.keyword();
    if (!/^\d+$/.test(num) || !/^\d+$/.test(gen) || kw !== 'obj') fail('not an object');
    return [Number(num), Number(gen)];
  }
}

const getInt = (d: Map<string, PdfValue>, key: string): number | undefined => {
  const v = d.get(key);
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined;
};
const isName = (v: PdfValue | undefined, name: string) =>
  typeof v === 'object' && v !== null && 'name' in v && v.name === name;

/** Decode a stream's data given its dictionary (FlateDecode with an optional PNG predictor, or no filter). */
function decodeStream(dict: Map<string, PdfValue>, raw: Uint8Array): Uint8Array {
  let filter = dict.get('Filter');
  let parms = dict.get('DecodeParms');
  if (Array.isArray(filter)) {
    if (filter.length > 1) fail('unsupported filter chain');
    filter = filter[0];
    parms = Array.isArray(parms) ? parms[0] : parms;
  }
  if (filter === undefined) return raw;
  if (!isName(filter, 'FlateDecode')) fail('unsupported filter');
  let data = inflate(raw);
  if (parms instanceof Map) {
    const predictor = getInt(parms, 'Predictor') ?? 1;
    if (predictor >= 10) {
      const colors = getInt(parms, 'Colors') ?? 1;
      const bpc = getInt(parms, 'BitsPerComponent') ?? 8;
      const columns = getInt(parms, 'Columns') ?? 1;
      const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
      const rowLen = Math.ceil((colors * bpc * columns) / 8);
      const rows = Math.floor(data.length / (rowLen + 1));
      const out = new Uint8Array(rows * rowLen);
      for (let r = 0; r < rows; r++) {
        const type = data[r * (rowLen + 1)];
        const src = r * (rowLen + 1) + 1;
        const dst = r * rowLen;
        for (let i = 0; i < rowLen; i++) {
          const x = data[src + i];
          const a = i >= bpp ? out[dst + i - bpp] : 0;
          const up = r > 0 ? out[dst - rowLen + i] : 0;
          const ul = r > 0 && i >= bpp ? out[dst - rowLen + i - bpp] : 0;
          let v: number;
          switch (type) {
            case 0:
              v = x;
              break;
            case 1:
              v = x + a;
              break;
            case 2:
              v = x + up;
              break;
            case 3:
              v = x + ((a + up) >> 1);
              break;
            case 4: {
              const p = a + up - ul;
              const pa = Math.abs(p - a);
              const pb = Math.abs(p - up);
              const pc = Math.abs(p - ul);
              v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : ul);
              break;
            }
            default:
              return fail('bad predictor');
          }
          out[dst + i] = v & 0xff;
        }
      }
      data = out;
    } else if (predictor !== 1) {
      fail('unsupported predictor');
    }
  }
  return data;
}

/** The raw data of the stream whose dictionary the parser just read; `length` resolves an indirect /Length. */
function streamData(
  p: Parser,
  dict: Map<string, PdfValue>,
  length: (v: PdfValue | undefined) => number,
): Uint8Array {
  if (p.keyword() !== 'stream') fail('no stream');
  if (p.b[p.pos] === 13) p.pos++;
  if (p.b[p.pos] === 10) p.pos++;
  const len = length(dict.get('Length'));
  if (!(len >= 0) || p.pos + len > p.b.length) fail('bad stream length');
  return p.b.subarray(p.pos, p.pos + len);
}

/** Read the xref table or xref stream at `offset`. */
function readXref(bytes: Uint8Array, offset: number): XrefSection {
  if (!(offset >= 0 && offset < bytes.length)) fail('xref offset out of range');
  const p = new Parser(bytes, offset);
  p.skipWS();
  const entries = new Map<number, Entry>();
  if (latin1(bytes, p.pos, p.pos + 4) === 'xref') {
    const at = p.pos;
    p.pos += 4;
    for (;;) {
      const tok = p.keyword();
      if (tok === 'trailer') break;
      const count = p.keyword();
      if (!/^\d+$/.test(tok) || !/^\d+$/.test(count)) fail('bad xref table');
      const first = Number(tok);
      for (let i = 0; i < Number(count); i++) {
        const off = p.keyword();
        const gen = p.keyword();
        const kind = p.keyword();
        if (!/^\d+$/.test(off) || !/^\d+$/.test(gen) || (kind !== 'n' && kind !== 'f'))
          fail('bad xref entry');
        const num = first + i;
        if (num === 0 || entries.has(num)) continue;
        entries.set(
          num,
          kind === 'n'
            ? { type: 1, offset: Number(off), gen: Number(gen) }
            : { type: 0, gen: Number(gen) },
        );
      }
    }
    p.skipWS();
    const trailer = p.value();
    if (!(trailer instanceof Map)) fail('bad trailer');
    return {
      kind: 'table',
      offset: at,
      entries,
      trailer: trailer as Map<string, PdfValue>,
    };
  }
  const at = p.pos;
  const [objNum] = p.objHeader();
  const dict = p.value();
  if (!(dict instanceof Map) || !isName(dict.get('Type'), 'XRef')) fail('not an xref stream');
  const d = dict as Map<string, PdfValue>;
  const data = decodeStream(
    d,
    streamData(p, d, (v) => (typeof v === 'number' ? v : fail('indirect xref stream length'))),
  );
  const w = d.get('W');
  if (
    !Array.isArray(w) ||
    w.length !== 3 ||
    !w.every((x) => typeof x === 'number' && x >= 0 && x <= 8)
  )
    fail('bad /W');
  const [w0, w1, w2] = w as number[];
  const size = getInt(d, 'Size') ?? fail('no /Size');
  const index = (d.get('Index') as PdfValue[] | undefined) ?? [0, size];
  if (!Array.isArray(index) || index.length % 2 !== 0) fail('bad /Index');
  const rowLen = w0 + w1 + w2;
  const field = (pos: number, n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + data[pos + i];
    return v;
  };
  let pos = 0;
  for (let k = 0; k < index.length; k += 2) {
    const first = index[k] as number;
    const count = index[k + 1] as number;
    for (let i = 0; i < count; i++) {
      if (pos + rowLen > data.length) fail('xref stream too short');
      const type = w0 === 0 ? 1 : field(pos, w0);
      const f2 = field(pos + w0, w1);
      const f3 = field(pos + w0 + w1, w2);
      pos += rowLen;
      const num = first + i;
      if (num === 0 || entries.has(num)) continue;
      if (type === 0) entries.set(num, { type: 0, gen: f3 });
      else if (type === 1) entries.set(num, { type: 1, offset: f2, gen: f3 });
      else if (type === 2) entries.set(num, { type: 2, stm: f2, idx: f3 });
    }
  }
  return { kind: 'stream', offset: at, entries, trailer: d, objNum };
}

/** The value after the last `startxref` keyword, and that keyword's position. */
function finalStartxref(bytes: Uint8Array): { offset: number; at: number } {
  const from = Math.max(0, bytes.length - 2048);
  const tail = latin1(bytes, from, bytes.length);
  const at = tail.lastIndexOf('startxref');
  if (at < 0) fail('no startxref');
  const m = /^startxref[\0\t\n\f\r ]+(\d+)/.exec(tail.slice(at));
  if (!m) fail('bad startxref');
  return { offset: Number(m![1]), at: from + at };
}

interface LastSection {
  start: number;
  prev: number;
  xref: XrefSection;
  /** A hybrid /XRefStm inside the section (its objects belong to it). */
  innerStm?: XrefSection;
  /** A hybrid /XRefStm before the section (kept where it is). */
  outerStm?: number;
  startxrefAt: number;
}

function lastSection(bytes: Uint8Array): LastSection {
  const { offset: startXRef, at: startxrefAt } = finalStartxref(bytes);
  if (!(startXRef > 0 && startXRef < startxrefAt)) fail('bad startxref');
  const xref = readXref(bytes, startXRef);
  const prev = getInt(xref.trailer, 'Prev');
  if (prev === undefined || prev < 0 || prev >= startXRef) fail('no previous revision');
  let eof = -1;
  for (let i = startXRef - 5; i >= 0; i--) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x25 &&
      bytes[i + 2] === 0x45 &&
      bytes[i + 3] === 0x4f &&
      bytes[i + 4] === 0x46
    ) {
      eof = i;
      break;
    }
  }
  if (eof < 0) fail('no previous %%EOF');
  const before = /startxref[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]*$/.exec(
    latin1(bytes, Math.max(0, eof - 64), eof),
  );
  if (!before || Number(before[1]) !== prev) fail('previous revision does not end at /Prev');
  let start = eof + 5;
  if (bytes[start] === 13) start++;
  if (bytes[start] === 10) start++;
  const result: LastSection = { start, prev, xref, startxrefAt };
  const stm = getInt(xref.trailer, 'XRefStm');
  if (xref.kind === 'table' && stm !== undefined && stm >= 0 && stm < bytes.length) {
    if (stm >= start) result.innerStm = readXref(bytes, stm);
    else result.outerStm = stm;
  }
  return result;
}

/** Each object's extent [offset, end) — up to its `endobj` — among the given boundaries. */
function objectSpans(
  bytes: Uint8Array,
  offsets: number[],
  boundaries: number[],
): Map<number, [number, number]> {
  const all = [...new Set([...offsets, ...boundaries])].sort((a, b) => a - b);
  const spans = new Map<number, [number, number]>();
  for (const off of offsets) {
    const next = all[all.indexOf(off) + 1] ?? bytes.length;
    const text = latin1(bytes, off, next);
    if (!/^\d+[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+obj\b/.test(text))
      fail('entry does not point at an object');
    const end = text.lastIndexOf('endobj');
    if (end < 0) fail('object without endobj');
    spans.set(off, [off, off + end + 6]);
  }
  return spans;
}

/**
 * Object reader over a layered xref view, used only to find which objects of
 * the old last section are still referenced.
 */
class Graph {
  private stmCache = new Map<number, Map<number, PdfValue>>();

  constructor(
    private readonly lookup: (num: number) => { entry: Entry; bytes: Uint8Array } | undefined,
    private readonly encrypted: boolean,
  ) {}

  private lengthOf = (v: PdfValue | undefined): number => {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && 'ref' in v) {
      const n = this.read(v.ref[0]);
      if (typeof n === 'number') return n;
    }
    return fail('bad stream length');
  };

  /** The object's value (a stream's dictionary for streams). */
  read(num: number): PdfValue {
    const found = this.lookup(num);
    if (!found || found.entry.type === 0) return null;
    const { entry, bytes } = found;
    if (entry.type === 1) {
      const p = new Parser(bytes, entry.offset);
      p.objHeader();
      return p.value();
    }
    let objs = this.stmCache.get(entry.stm);
    if (!objs) {
      if (this.encrypted) fail('encrypted object stream');
      const stm = this.lookup(entry.stm);
      if (!stm || stm.entry.type !== 1) fail('object stream not found');
      const p = new Parser(stm!.bytes, (stm!.entry as { offset: number }).offset);
      p.objHeader();
      const dict = p.value();
      if (!(dict instanceof Map)) fail('bad object stream');
      const d = dict as Map<string, PdfValue>;
      const data = decodeStream(d, streamData(p, d, this.lengthOf));
      const n = getInt(d, 'N') ?? fail('bad object stream');
      const first = getInt(d, 'First') ?? fail('bad object stream');
      const hp = new Parser(data, 0);
      const header: [number, number][] = [];
      for (let i = 0; i < n!; i++) header.push([Number(hp.keyword()), Number(hp.keyword())]);
      objs = new Map();
      for (const [objNum, off] of header) {
        const op = new Parser(data, first! + off);
        objs.set(objNum, op.value());
      }
      this.stmCache.set(entry.stm, objs);
    }
    return objs.get(num) ?? null;
  }

  /** Every object number reachable from `roots`. */
  reachable(roots: number[]): Set<number> {
    const seen = new Set<number>();
    const stack = [...roots];
    while (stack.length > 0) {
      const num = stack.pop()!;
      if (seen.has(num)) continue;
      seen.add(num);
      const visit = (v: PdfValue) => {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v instanceof Map) v.forEach(visit);
        else if (v && typeof v === 'object' && 'ref' in v) stack.push(v.ref[0]);
      };
      visit(this.read(num));
    }
    return seen;
  }
}

/** Every entry of the revision chain starting at `offset` (newest wins). */
function chainEntries(bytes: Uint8Array, offset: number): Map<number, Entry> {
  const entries = new Map<number, Entry>();
  const visited = new Set<number>();
  let at: number | undefined = offset;
  while (at !== undefined) {
    if (visited.has(at) || visited.size > 10000) fail('xref chain loop');
    visited.add(at);
    const section = readXref(bytes, at);
    const add = (m: Map<number, Entry>) => m.forEach((e, n) => entries.has(n) || entries.set(n, e));
    add(section.entries);
    const stm = section.kind === 'table' ? getInt(section.trailer, 'XRefStm') : undefined;
    if (stm !== undefined) add(readXref(bytes, stm).entries);
    at = getInt(section.trailer, 'Prev');
  }
  return entries;
}

const refNum = (v: PdfValue | undefined): number | undefined =>
  v && typeof v === 'object' && 'ref' in v ? v.ref[0] : undefined;

/**
 * `saved` = `loaded` + one appended update section (an incremental save of
 * `loaded`). Returns the file with that section merged into `loaded`'s last
 * update section, or `saved` itself when that is not provably safe.
 */
export function mergeIntoLastUpdate(loaded: Uint8Array, saved: Uint8Array): Uint8Array {
  try {
    return merge(loaded, saved);
  } catch {
    // Unproven structure (or anything unexpected): keep the plain append.
    return saved;
  }
}

function merge(loaded: Uint8Array, saved: Uint8Array): Uint8Array {
  if (saved.length <= loaded.length) fail('not an append');
  for (let i = 0; i < loaded.length; i++)
    if (saved[i] !== loaded[i]) fail('save does not keep the loaded bytes');

  const last = lastSection(loaded);
  if (/\/ByteRange[\0\t\n\f\r ]*\[/.test(latin1(loaded, last.start, loaded.length)))
    fail('signed section');

  // The appended section: an xref table chaining to the loaded file.
  const added = finalStartxref(saved);
  const loadedXref = finalStartxref(loaded).offset;
  if (added.offset < loaded.length) fail('save has no own xref');
  const fresh = readXref(saved, added.offset);
  if (getInt(fresh.trailer, 'Prev') !== loadedXref) fail('unexpected save layout');
  if (getInt(fresh.trailer, 'XRefStm') !== undefined) fail('unexpected save layout');
  // The save's own xref stream is a container, not content.
  if (fresh.objNum !== undefined) fresh.entries.delete(fresh.objNum);
  if (/\/ByteRange[\0\t\n\f\r ]*\[/.test(latin1(saved, loaded.length, saved.length)))
    fail('save signs');

  // Old section entries: the table/stream, then an inner hybrid stream.
  const oldEntries = new Map<number, Entry>(last.xref.entries);
  last.innerStm?.entries.forEach((e, n) => oldEntries.has(n) || oldEntries.set(n, e));
  const containers = new Set<number>();
  if (last.xref.objNum !== undefined) containers.add(last.xref.objNum);
  if (last.innerStm?.objNum !== undefined) containers.add(last.innerStm.objNum);
  for (const n of containers) oldEntries.delete(n);

  const inSection = (e: Entry) => e.type === 1 && e.offset >= last.start;
  const oldOffsets = [...oldEntries.values()]
    .filter(inSection)
    .map((e) => (e as { offset: number }).offset);
  const oldBoundaries = [last.xref.offset, last.startxrefAt, loaded.length];
  if (last.innerStm) oldBoundaries.push(last.innerStm.offset);
  const oldSpans = objectSpans(loaded, oldOffsets, oldBoundaries);

  const freshOffsets = [...fresh.entries.values()]
    .filter((e) => e.type === 1)
    .map((e) => (e as { offset: number }).offset);
  if (freshOffsets.some((o) => o < loaded.length || o >= added.offset))
    fail('unexpected save layout');
  const freshSpans = objectSpans(saved, freshOffsets, [added.offset, added.at, saved.length]);

  // Which old objects stay: not overridden, and still in use.
  const kept = new Map<number, Entry>();
  oldEntries.forEach((e, n) => fresh.entries.has(n) || kept.set(n, e));

  let prefix: Map<number, Entry> | null = null;
  try {
    prefix = chainEntries(loaded, last.prev);
    if (last.outerStm !== undefined) {
      const outer = readXref(loaded, last.outerStm).entries;
      outer.forEach((e, n) => prefix!.set(n, e));
    }
  } catch {
    prefix = null;
  }
  if (prefix) {
    const graph = new Graph((num) => {
      const f = fresh.entries.get(num);
      if (f) return { entry: f, bytes: saved };
      const o = kept.get(num);
      if (o) return { entry: o, bytes: loaded };
      const p = prefix!.get(num);
      return p ? { entry: p, bytes: loaded } : undefined;
    }, fresh.trailer.has('Encrypt'));
    const roots = ['Root', 'Info', 'Encrypt']
      .map((k) => refNum(fresh.trailer.get(k)))
      .filter((n): n is number => n !== undefined);
    let live: Set<number> | null = null;
    try {
      live = graph.reachable(roots);
    } catch {
      live = null;
    }
    if (live) {
      for (const [n, e] of [...kept]) {
        // Object streams are containers, never referenced: handled below.
        if (e.type === 1 && isObjStm(loaded, e.offset)) continue;
        if (e.type !== 0 && !live.has(n)) kept.delete(n);
      }
    }
  }
  // Object streams of the old section stay while one of their objects does.
  for (const [n, e] of [...kept]) {
    if (e.type === 1 && inSection(e) && isObjStm(loaded, e.offset)) {
      const used = [...kept.values()].some((k) => k.type === 2 && k.stm === n);
      if (!used) kept.delete(n);
    }
  }

  // Assemble: prefix, objects, xref.
  const parts: Uint8Array[] = [loaded.subarray(0, last.start)];
  let pos = last.start;
  const push = (chunk: Uint8Array) => {
    parts.push(chunk);
    pos += chunk.length;
  };
  const nl = ascii('\n');
  const prevByte = loaded[last.start - 1];
  if (prevByte !== 10 && prevByte !== 13) push(nl);

  const final = new Map<number, Entry>();
  const copy = (bytes: Uint8Array, span: [number, number], n: number, gen: number) => {
    final.set(n, { type: 1, offset: pos, gen });
    push(bytes.subarray(span[0], span[1]));
    push(nl);
  };
  const keptSorted = [...kept].sort((a, b) => a[0] - b[0]);
  for (const [n, e] of keptSorted) {
    if (e.type === 1 && inSection(e)) copy(loaded, oldSpans.get(e.offset)!, n, e.gen);
    else final.set(n, e);
  }
  for (const [n, e] of [...fresh.entries].sort((a, b) => a[0] - b[0])) {
    if (e.type === 1) copy(saved, freshSpans.get(e.offset)!, n, e.gen);
    else final.set(n, e);
  }

  let maxNum = 0;
  final.forEach((_, n) => (maxNum = Math.max(maxNum, n)));
  const sizeOf = (s: XrefSection) => getInt(s.trailer, 'Size') ?? 0;
  // /Size is one past the highest object number in use: the earlier
  // revisions' /Size, or this section's highest number. (A save's own /Size
  // may count numbers it reserved and never wrote.)
  let prevSize: number;
  try {
    prevSize = sizeOf(readXref(loaded, last.prev));
  } catch {
    prevSize = sizeOf(last.xref);
  }
  let size = Math.max(prevSize, maxNum + 1);

  // The trailer keys come from the new save's trailer.
  const structural = new Set([
    'Prev',
    'Size',
    'XRefStm',
    'Type',
    'W',
    'Index',
    'Length',
    'Filter',
    'DecodeParms',
  ]);
  const trailerBody = [...fresh.trailer]
    .filter(([k]) => !structural.has(k))
    .map(([k, v]) => `/${k} ${serialize(v)}`)
    .join(' ');

  const compressed = [...final].filter(([, e]) => e.type === 2);
  const xrefStreamText = (num: number, rows: [number, Entry][], extra: string) => {
    rows.sort((a, b) => a[0] - b[0]);
    const index: number[] = [];
    for (const [n] of rows) {
      if (index.length && index[index.length - 2] + index[index.length - 1] === n)
        index[index.length - 1]++;
      else index.push(n, 1);
    }
    const data = new Uint8Array(rows.length * 7);
    rows.forEach(([, e], i) => {
      const [t, f2, f3] =
        e.type === 0 ? [0, 0, e.gen] : e.type === 1 ? [1, e.offset, e.gen] : [2, e.stm, e.idx];
      const o = i * 7;
      data[o] = t;
      data[o + 1] = (f2 >>> 24) & 0xff;
      data[o + 2] = (f2 >>> 16) & 0xff;
      data[o + 3] = (f2 >>> 8) & 0xff;
      data[o + 4] = f2 & 0xff;
      data[o + 5] = (f3 >>> 8) & 0xff;
      data[o + 6] = f3 & 0xff;
    });
    return {
      head: ascii(
        `${num} 0 obj\n<</Type /XRef /W [1 4 2] /Index [${index.join(' ')}] /Length ${data.length}${extra}>>\nstream\n`,
      ),
      data,
      tail: ascii('\nendstream\nendobj\n'),
    };
  };
  const freeNum = (preferred: number | undefined) => {
    if (preferred !== undefined && !final.has(preferred)) return preferred;
    return size++;
  };

  let xrefAt: number;
  if (last.xref.kind === 'stream') {
    const num = freeNum(last.xref.objNum);
    xrefAt = pos;
    const rows: [number, Entry][] = [...final, [num, { type: 1, offset: xrefAt, gen: 0 }]];
    size = Math.max(size, num + 1);
    const s = xrefStreamText(num, rows, ` /Size ${size} /Prev ${last.prev} ${trailerBody}`);
    push(s.head);
    push(s.data);
    push(s.tail);
  } else {
    let xrefStm: number | undefined = last.outerStm;
    if (compressed.length > 0) {
      const num = freeNum(last.innerStm?.objNum);
      size = Math.max(size, num + 1);
      xrefStm = pos;
      const s = xrefStreamText(
        num,
        [...compressed, [num, { type: 1, offset: xrefStm, gen: 0 }]],
        ` /Size ${size}`,
      );
      push(s.head);
      push(s.data);
      push(s.tail);
    }
    xrefAt = pos;
    const rows = [...final].filter(([, e]) => e.type !== 2).sort((a, b) => a[0] - b[0]);
    let text = 'xref\n0 1\n0000000000 65535 f\r\n';
    for (let i = 0; i < rows.length; ) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1][0] === rows[j][0] + 1) j++;
      text += `${rows[i][0]} ${j - i + 1}\n`;
      for (let k = i; k <= j; k++) {
        const e = rows[k][1] as Exclude<Entry, { type: 2 }>;
        text +=
          e.type === 1
            ? `${String(e.offset).padStart(10, '0')} ${String(e.gen).padStart(5, '0')} n\r\n`
            : `0000000000 ${String(e.gen).padStart(5, '0')} f\r\n`;
      }
      i = j + 1;
    }
    const stm = xrefStm !== undefined ? ` /XRefStm ${xrefStm}` : '';
    text += `trailer\n<</Size ${size} /Prev ${last.prev}${stm} ${trailerBody}>>\n`;
    push(ascii(text));
  }
  push(ascii(`startxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(pos);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function serialize(v: PdfValue): string {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.map(serialize).join(' ')}]`;
  if (v instanceof Map) return `<<${[...v].map(([k, x]) => `/${k} ${serialize(x)}`).join(' ')}>>`;
  if ('name' in v) return `/${v.name}`;
  if ('ref' in v) return `${v.ref[0]} ${v.ref[1]} R`;
  return v.keyword;
}

function isObjStm(bytes: Uint8Array, offset: number): boolean {
  try {
    const p = new Parser(bytes, offset);
    p.objHeader();
    const d = p.value();
    return d instanceof Map && isName(d.get('Type'), 'ObjStm');
  } catch {
    return false;
  }
}
