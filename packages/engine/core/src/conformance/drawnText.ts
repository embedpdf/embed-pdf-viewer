/**
 * The text an exported appearance draws, read back from its PDF: for each
 * form that shows text, its box and its runs, left to right as the stream
 * draws them. Just enough of PDF to read what the engine writes: plain
 * objects, Flate streams, and text placed with `Td` or `Tm` and shown with
 * `Tj` or `TJ`.
 */

/** One form's drawn text. */
export interface DrawnText {
  /** The form's /BBox: its own space, which the runs are in. */
  box: { left: number; bottom: number; right: number; top: number };
  runs: DrawnRun[];
}

/**
 * Text one font draws in a row: consecutive strings in the same font and the
 * same marked-content span, on one baseline.
 */
export interface DrawnRun {
  /** The font's /BaseFont without its subset tag: `'Helvetica'`, `'NotoSansHebrew'`. */
  font: string;
  /** What the run says: its /ActualText when it has one, else its glyphs' text. */
  text: string;
  /** Its glyphs' text (ToUnicode, else the encoding) in the order drawn. */
  glyphs: string;
  /** The /ActualText of the span around it. */
  actualText?: string;
  /** Where its first string starts. */
  x: number;
  /** Where the pen ends after it: known when the font says its widths. */
  end?: number;
  /**
   * The baseline most of its glyphs sit on: a glyph the engine moves up or
   * down (a mark, a joined letter) is drawn on a line of its own.
   */
  baseline: number;
}

/** The text the forms in `pdf` draw. */
export async function drawnTextOf(pdf: Uint8Array): Promise<DrawnText[]> {
  const file = await PdfFile.read(pdf);
  const drawn: DrawnText[] = [];
  for (const object of file.objects()) {
    const dict = object.value;
    if (!(dict instanceof Map) || nameOf(dict.get('Subtype')) !== 'Form' || !object.stream) {
      continue;
    }
    const runs = runsOf(await file.streamData(object.number), file.fontsOf(dict));
    if (runs.length === 0) continue;
    const [left = 0, bottom = 0, right = 0, top = 0] = numbersOf(file.resolve(dict.get('BBox')));
    drawn.push({ box: { left, bottom, right, top }, runs });
  }
  return drawn;
}

// ── values ───────────────────────────────────────────────────────────────

interface Name {
  name: string;
}
interface Bytes {
  bytes: number[];
}
interface Ref {
  ref: number;
}
interface Operator {
  op: string;
}
type PdfValue = number | boolean | null | Name | Bytes | Ref | Operator | PdfValue[] | PdfDict;
type PdfDict = Map<string, PdfValue>;

const isOperator = (value: PdfValue): value is Operator =>
  value !== null && typeof value === 'object' && 'op' in value;
const nameOf = (value: PdfValue | undefined): string | undefined =>
  value && typeof value === 'object' && 'name' in value ? value.name : undefined;
const refOf = (value: PdfValue | undefined): number | undefined =>
  value && typeof value === 'object' && 'ref' in value ? value.ref : undefined;
const bytesOf = (value: PdfValue | undefined): number[] | undefined =>
  value && typeof value === 'object' && 'bytes' in value ? value.bytes : undefined;
const numbersOf = (value: PdfValue | undefined): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

/** Bytes as a string of the same length, one character per byte. */
function binary(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return text;
}

/** UTF-16BE, as ToUnicode targets and /ActualText (after its BOM) are. */
function utf16(bytes: number[]): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  }
  return text;
}

const WHITE = /[\0\t\n\f\r ]/;
const DELIMITER = /[()<>[\]{}/%]/;
const isRegular = (c: string | undefined) =>
  c !== undefined && !WHITE.test(c) && !DELIMITER.test(c);
const ESCAPES: Record<string, number> = {
  n: 10,
  r: 13,
  t: 9,
  b: 8,
  f: 12,
  '(': 40,
  ')': 41,
  '\\': 92,
};

/** Reads PDF values and operators from `text` (one character per byte). */
class Lexer {
  at = 0;
  constructor(private readonly text: string) {}

  /** The next value or operator; undefined at the end. Arrays and dicts come whole. */
  next(): PdfValue | undefined {
    this.skip();
    const c = this.text[this.at];
    if (c === undefined) return undefined;
    if (c === '/') return this.name();
    if (c === '(') return this.literal();
    if (c === '<' && this.text[this.at + 1] === '<') return this.dict();
    if (c === '<') return this.hex();
    if (c === '[') return this.array();
    if (c === ']' || c === '>') {
      this.at += c === '>' ? 2 : 1;
      return { op: c };
    }
    const start = this.at;
    while (isRegular(this.text[this.at])) this.at += 1;
    if (this.at === start) this.at += 1;
    const word = this.text.slice(start, this.at);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return Number(word);
    if (word === 'true' || word === 'false') return word === 'true';
    if (word === 'null') return null;
    return { op: word };
  }

  private skip(): void {
    for (;;) {
      const c = this.text[this.at];
      if (c !== undefined && WHITE.test(c)) {
        this.at += 1;
      } else if (c === '%') {
        while (this.text[this.at] !== undefined && !/[\r\n]/.test(this.text[this.at]!)) {
          this.at += 1;
        }
      } else {
        return;
      }
    }
  }

  private name(): Name {
    const start = ++this.at;
    while (isRegular(this.text[this.at])) this.at += 1;
    const raw = this.text.slice(start, this.at);
    return {
      name: raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      ),
    };
  }

  private literal(): Bytes {
    this.at += 1;
    const bytes: number[] = [];
    let depth = 1;
    while (this.at < this.text.length) {
      const c = this.text[this.at++]!;
      if (c === '\\') {
        const e = this.text[this.at++] ?? '';
        if (e in ESCAPES) {
          bytes.push(ESCAPES[e]!);
        } else if (/[0-7]/.test(e)) {
          let octal = e;
          while (octal.length < 3 && /[0-7]/.test(this.text[this.at] ?? '')) {
            octal += this.text[this.at++];
          }
          bytes.push(parseInt(octal, 8) & 0xff);
        } else if (e === '\r') {
          if (this.text[this.at] === '\n') this.at += 1;
        } else if (e !== '\n') {
          bytes.push(e.charCodeAt(0));
        }
        continue;
      }
      if (c === '(') depth += 1;
      if (c === ')' && --depth === 0) break;
      bytes.push(c.charCodeAt(0));
    }
    return { bytes };
  }

  private hex(): Bytes {
    const end = this.text.indexOf('>', this.at);
    let digits = this.text.slice(this.at + 1, end).replace(/[^0-9a-fA-F]/g, '');
    this.at = end + 1;
    if (digits.length % 2) digits += '0';
    const bytes: number[] = [];
    for (let i = 0; i < digits.length; i += 2) bytes.push(parseInt(digits.slice(i, i + 2), 16));
    return { bytes };
  }

  private array(): PdfValue[] {
    this.at += 1;
    return this.until(']');
  }

  private dict(): PdfDict {
    this.at += 2;
    const items = this.until('>');
    const dict: PdfDict = new Map();
    for (let i = 0; i + 1 < items.length; i += 2) {
      const key = nameOf(items[i]);
      if (key !== undefined) dict.set(key, items[i + 1]!);
    }
    return dict;
  }

  /** Values up to the closing `end`, with each `N G R` folded into a reference. */
  private until(end: string): PdfValue[] {
    const items: PdfValue[] = [];
    for (let value = this.next(); value !== undefined; value = this.next()) {
      if (isOperator(value) && value.op === end) break;
      const n = items.length;
      if (
        isOperator(value) &&
        value.op === 'R' &&
        typeof items[n - 1] === 'number' &&
        typeof items[n - 2] === 'number'
      ) {
        items.splice(n - 2, 2, { ref: items[n - 2] as number });
        continue;
      }
      items.push(value);
    }
    return items;
  }
}

// ── the file ─────────────────────────────────────────────────────────────

interface PdfObject {
  number: number;
  value: PdfValue | undefined;
  /** Where its stream's bytes are in the file; `exact` when its /Length said so. */
  stream?: { start: number; end: number; exact: boolean };
}

/** A PDF file's objects, by number. */
class PdfFile {
  private readonly byNumber = new Map<number, PdfObject>();
  private readonly fonts = new Map<number, DrawnFont>();

  /** The file, with its fonts read. */
  static async read(bytes: Uint8Array): Promise<PdfFile> {
    const file = new PdfFile(bytes);
    await file.readFonts();
    return file;
  }

  private constructor(private readonly bytes: Uint8Array) {
    const text = binary(bytes);
    const header = /(\d+)\s+\d+\s+obj\b/g;
    const marker = /\s*stream\r?\n/y;
    const lexer = new Lexer(text);
    for (let match = header.exec(text); match; match = header.exec(text)) {
      lexer.at = match.index + match[0].length;
      const value = lexer.next();
      const object: PdfObject = { number: Number(match[1]), value };
      marker.lastIndex = lexer.at;
      const stream = value instanceof Map ? marker.exec(text) : null;
      if (stream && value instanceof Map) {
        // Its /Length says where it ends; compressed bytes can hold anything.
        const start = lexer.at + stream[0].length;
        const length = value.get('Length');
        object.stream =
          typeof length === 'number'
            ? { start, end: start + length, exact: true }
            : { start, end: text.indexOf('endstream', start), exact: false };
        header.lastIndex = object.stream.end;
      } else {
        header.lastIndex = lexer.at;
      }
      this.byNumber.set(object.number, object);
    }
  }

  objects(): PdfObject[] {
    return [...this.byNumber.values()];
  }

  /** A value, with a reference followed. */
  resolve(value: PdfValue | undefined): PdfValue | undefined {
    const ref = refOf(value);
    return ref === undefined ? value : this.byNumber.get(ref)?.value;
  }

  /** The fonts a form's resources name, by resource name. */
  fontsOf(form: PdfDict): Map<string, DrawnFont> {
    const fonts = new Map<string, DrawnFont>();
    const resources = this.resolve(form.get('Resources'));
    const dict = resources instanceof Map ? this.resolve(resources.get('Font')) : undefined;
    if (!(dict instanceof Map)) return fonts;
    for (const [alias, value] of dict) {
      const font = this.fonts.get(refOf(value) ?? -1);
      if (font) fonts.set(alias, font);
    }
    return fonts;
  }

  /** A stream's data, decoded when Flate-encoded. */
  async streamData(number: number): Promise<Uint8Array> {
    const object = this.byNumber.get(number);
    if (!object?.stream || !(object.value instanceof Map)) return new Uint8Array();
    let { end } = object.stream;
    while (
      !object.stream.exact &&
      end > object.stream.start &&
      (this.bytes[end - 1] === 10 || this.bytes[end - 1] === 13)
    ) {
      end -= 1;
    }
    const data = this.bytes.subarray(object.stream.start, end);
    const filter = this.resolve(object.value.get('Filter'));
    const filters = Array.isArray(filter) ? filter.map(nameOf) : [nameOf(filter)];
    if (!filters.includes('FlateDecode')) return data;
    return new Uint8Array(
      await new Response(
        new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')),
      ).arrayBuffer(),
    );
  }

  /** Every font in the file: its name, its codes' widths and their text. */
  private async readFonts(): Promise<void> {
    for (const object of this.byNumber.values()) {
      const font = object.value;
      if (!(font instanceof Map) || nameOf(font.get('Type')) !== 'Font') continue;
      const subtype = nameOf(font.get('Subtype'));
      if (subtype === 'CIDFontType0' || subtype === 'CIDFontType2') continue;
      const toUnicode = refOf(font.get('ToUnicode'));
      this.fonts.set(object.number, {
        name: (nameOf(font.get('BaseFont')) ?? '').replace(/^[A-Z]{6}\+/, ''),
        twoByte: subtype === 'Type0',
        toUnicode:
          toUnicode === undefined
            ? new Map()
            : toUnicodeOf(binary(await this.streamData(toUnicode))),
        width: this.widthsOf(font, subtype === 'Type0'),
      });
    }
  }

  /** A code's width in 1/1000 em, as the font's /Widths or its CIDFont's /W say. */
  private widthsOf(font: PdfDict, twoByte: boolean): (code: number) => number | undefined {
    if (!twoByte) {
      const widths = numbersOf(this.resolve(font.get('Widths')));
      const first = this.resolve(font.get('FirstChar'));
      if (widths.length === 0 || typeof first !== 'number') return () => undefined;
      return (code) => widths[code - first];
    }
    const descendants = this.resolve(font.get('DescendantFonts'));
    const cidFont = Array.isArray(descendants) ? this.resolve(descendants[0]) : undefined;
    if (!(cidFont instanceof Map)) return () => undefined;
    const fallback = this.resolve(cidFont.get('DW'));
    const byCid = new Map<number, number>();
    const w = this.resolve(cidFont.get('W'));
    const items = Array.isArray(w) ? w.map((item) => this.resolve(item)) : [];
    for (let i = 0; i < items.length; ) {
      const first = items[i];
      const next = items[i + 1];
      if (typeof first !== 'number') break;
      if (Array.isArray(next)) {
        numbersOf(next).forEach((width, k) => byCid.set(first + k, width));
        i += 2;
      } else if (typeof next === 'number' && typeof items[i + 2] === 'number') {
        for (let cid = first; cid <= next; cid++) byCid.set(cid, items[i + 2] as number);
        i += 3;
      } else {
        break;
      }
    }
    // Identity-H: a code is its CID.
    return (code) => byCid.get(code) ?? (typeof fallback === 'number' ? fallback : 1000);
  }
}

// ── fonts ────────────────────────────────────────────────────────────────

interface DrawnFont {
  name: string;
  /** Codes are two bytes (a composite font). */
  twoByte: boolean;
  toUnicode: Map<number, string>;
  width: (code: number) => number | undefined;
}

/** A ToUnicode CMap's `bfchar` and `bfrange` mappings. */
function toUnicodeOf(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const code = (value: PdfValue | undefined) =>
    (bytesOf(value) ?? []).reduce((sum, byte) => sum * 256 + byte, 0);
  const lexer = new Lexer(cmap);
  const operands: PdfValue[] = [];
  for (let value = lexer.next(); value !== undefined; value = lexer.next()) {
    if (!isOperator(value)) {
      operands.push(value);
      continue;
    }
    if (value.op === 'endbfchar') {
      for (let i = 0; i + 1 < operands.length; i += 2) {
        map.set(code(operands[i]), utf16(bytesOf(operands[i + 1]) ?? []));
      }
    } else if (value.op === 'endbfrange') {
      for (let i = 0; i + 2 < operands.length; i += 3) {
        const low = code(operands[i]);
        const high = code(operands[i + 1]);
        const target = operands[i + 2];
        for (let c = low; c <= high; c++) {
          if (Array.isArray(target)) {
            map.set(c, utf16(bytesOf(target[c - low]) ?? []));
          } else {
            // The range's last UTF-16 unit counts up from its first code.
            const base = utf16(bytesOf(target) ?? []);
            const last = base.charCodeAt(base.length - 1) + c - low;
            map.set(c, base.slice(0, -1) + String.fromCharCode(last));
          }
        }
      }
    }
    operands.length = 0;
  }
  return map;
}

/** WinAnsiEncoding where it isn't Latin-1: 0x80 to 0x9F. */
const WIN_ANSI_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/** A string's codes. */
function codesOf(font: DrawnFont | undefined, bytes: number[]): number[] {
  if (!font?.twoByte) return bytes;
  const codes: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i]! << 8) | bytes[i + 1]!);
  return codes;
}

function textOf(font: DrawnFont | undefined, code: number): string {
  const mapped = font?.toUnicode.get(code);
  if (mapped !== undefined) return mapped;
  if (font?.twoByte) return '\uFFFD';
  return String.fromCharCode(
    code >= 0x80 && code <= 0x9f ? WIN_ANSI_HIGH[code - 0x80] || code : code,
  );
}

// ── the content ──────────────────────────────────────────────────────────

interface TextState {
  font: DrawnFont | undefined;
  size: number;
  /** Character spacing (`Tc`), word spacing (`Tw`), horizontal scale (`Tz`, as a fraction). */
  tc: number;
  tw: number;
  th: number;
}

/** A content stream's text, as runs. */
function runsOf(content: Uint8Array, fonts: Map<string, DrawnFont>): DrawnRun[] {
  const runs: DrawnRun[] = [];
  const lexer = new Lexer(binary(content));
  const operands: PdfValue[] = [];
  const saved: TextState[] = [];
  let state: TextState = { font: undefined, size: 0, tc: 0, tw: 0, th: 1 };
  // Open marked content, innermost last: an /ActualText, or null for another tag.
  const marks: (string | null)[] = [];
  let line = { x: 0, y: 0 };
  let pen = 0;
  let current: DrawnRun | undefined;
  let currentSpan: string | null = null;
  let currentY = 0;
  // Per run, how many glyphs each baseline it was drawn on holds.
  const glyphsAt = new Map<DrawnRun, Map<number, number>>();
  const tally = (run: DrawnRun, glyphs: string) => {
    const counts = glyphsAt.get(run) ?? new Map<number, number>();
    counts.set(line.y, (counts.get(line.y) ?? 0) + [...glyphs].length);
    glyphsAt.set(run, counts);
  };

  /** Moves the pen over a string, or over a `TJ` array's strings and adjustments. */
  const draw = (items: PdfValue[]) => {
    let glyphs = '';
    let measured = true;
    for (const item of items) {
      if (typeof item === 'number') {
        pen -= (item / 1000) * state.size * state.th;
        continue;
      }
      for (const code of codesOf(state.font, bytesOf(item) ?? [])) {
        glyphs += textOf(state.font, code);
        const width = state.font?.width(code);
        if (width === undefined) measured = false;
        const space = !state.font?.twoByte && code === 32 ? state.tw : 0;
        pen += (((width ?? 0) / 1000) * state.size + state.tc + space) * state.th;
      }
    }
    return { glyphs, measured };
  };

  const show = (items: PdfValue[]) => {
    const span = [...marks].reverse().find((mark) => mark !== null) ?? null;
    const font = state.font?.name ?? '';
    const x = pen;
    const continues =
      current !== undefined &&
      current.font === font &&
      currentSpan === span &&
      (span !== null || currentY === line.y);
    const { glyphs, measured } = draw(items);
    if (continues && current) {
      tally(current, glyphs);
      current.glyphs += glyphs;
      if (span === null) current.text += glyphs;
      if (measured && current.end !== undefined) {
        current.end = pen;
      } else {
        delete current.end;
      }
      return;
    }
    current = {
      font,
      text: span ?? glyphs,
      glyphs,
      ...(span !== null ? { actualText: span } : {}),
      x,
      ...(measured ? { end: pen } : {}),
      baseline: line.y,
    };
    currentSpan = span;
    currentY = line.y;
    tally(current, glyphs);
    runs.push(current);
  };

  for (let value = lexer.next(); value !== undefined; value = lexer.next()) {
    if (!isOperator(value)) {
      operands.push(value);
      continue;
    }
    const numbers = operands.filter((operand): operand is number => typeof operand === 'number');
    switch (value.op) {
      case 'q':
        saved.push({ ...state });
        break;
      case 'Q':
        state = saved.pop() ?? state;
        break;
      case 'BT':
        line = { x: 0, y: 0 };
        pen = 0;
        break;
      case 'Tf':
        state.font = fonts.get(nameOf(operands[0]) ?? '');
        state.size = numbers[0] ?? 0;
        break;
      case 'Tc':
        state.tc = numbers[0] ?? 0;
        break;
      case 'Tw':
        state.tw = numbers[0] ?? 0;
        break;
      case 'Tz':
        state.th = (numbers[0] ?? 100) / 100;
        break;
      case 'Td':
      case 'TD':
        line = { x: line.x + (numbers[0] ?? 0), y: line.y + (numbers[1] ?? 0) };
        pen = line.x;
        break;
      case 'Tm':
        line = { x: numbers[4] ?? 0, y: numbers[5] ?? 0 };
        pen = line.x;
        break;
      case 'Tj':
        show(operands.slice(-1));
        break;
      case 'TJ': {
        const items = operands[operands.length - 1];
        if (Array.isArray(items)) show(items);
        break;
      }
      case 'BDC': {
        const properties = operands[operands.length - 1];
        const actualText =
          properties instanceof Map ? bytesOf(properties.get('ActualText')) : undefined;
        if (!actualText) {
          marks.push(null);
        } else if (actualText[0] === 0xfe && actualText[1] === 0xff) {
          marks.push(utf16(actualText.slice(2)));
        } else {
          marks.push(String.fromCharCode(...actualText));
        }
        break;
      }
      case 'BMC':
        marks.push(null);
        break;
      case 'EMC':
        marks.pop();
        break;
      default:
        break;
    }
    operands.length = 0;
  }
  for (const run of runs) {
    let most = 0;
    for (const [y, count] of glyphsAt.get(run) ?? []) {
      if (count >= most) {
        most = count;
        run.baseline = y;
      }
    }
  }
  return runs;
}
