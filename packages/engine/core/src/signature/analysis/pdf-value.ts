import type { PdfValue } from './types';

/**
 * Parse the fork's canonical shallow serialisation:
 *   dict     <</Key value/Key2 value>>        (keys sorted, `#xx`-escaped)
 *   array    [item item]
 *   ref      n 0 R
 *   stream   stream(length,sha256hex)<<dict>>
 *   name     /Name (with #xx escapes)
 *   string   (literal with backslash escapes) or <hex>
 *   number   -12.5   bool  true|false   null
 */
export function parsePdfValue(text: string): PdfValue {
  const parser = new Parser(text);
  const value = parser.value();
  parser.skipSpaces();
  if (!parser.atEnd()) throw new Error(`trailing input at ${parser.pos}: ${text.slice(parser.pos, parser.pos + 20)}`);
  return value;
}

class Parser {
  pos = 0;
  constructor(private readonly text: string) {}

  atEnd(): boolean {
    return this.pos >= this.text.length;
  }

  skipSpaces(): void {
    while (this.pos < this.text.length && this.text[this.pos] === ' ') this.pos++;
  }

  value(): PdfValue {
    this.skipSpaces();
    const t = this.text;
    if (t.startsWith('<<', this.pos)) return this.dict();
    if (t.startsWith('stream(', this.pos)) return this.stream();
    if (t[this.pos] === '[') return this.array();
    if (t[this.pos] === '/') return { t: 'name', v: this.name() };
    if (t[this.pos] === '(') return { t: 'string', v: this.literalString() };
    if (t[this.pos] === '<') return { t: 'string', v: this.hexString() };
    if (t.startsWith('true', this.pos)) {
      this.pos += 4;
      return { t: 'bool', v: true };
    }
    if (t.startsWith('false', this.pos)) {
      this.pos += 5;
      return { t: 'bool', v: false };
    }
    if (t.startsWith('null', this.pos)) {
      this.pos += 4;
      return { t: 'null' };
    }
    const ref = /^(\d+) 0 R(?![0-9A-Za-z])/.exec(t.slice(this.pos));
    if (ref) {
      this.pos += ref[0].length;
      return { t: 'ref', num: Number(ref[1]) };
    }
    const num = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(t.slice(this.pos));
    if (num) {
      this.pos += num[0].length;
      return { t: 'number', v: Number(num[0]) };
    }
    throw new Error(`unexpected input at ${this.pos}: ${t.slice(this.pos, this.pos + 20)}`);
  }

  private dict(): PdfValue {
    return { t: 'dict', entries: this.dictEntries() };
  }

  private dictEntries(): Record<string, PdfValue> {
    this.expect('<<');
    const entries: Record<string, PdfValue> = {};
    for (;;) {
      this.skipSpaces();
      if (this.text.startsWith('>>', this.pos)) {
        this.pos += 2;
        return entries;
      }
      if (this.text[this.pos] !== '/') throw new Error(`expected a key at ${this.pos}`);
      const key = this.name();
      this.skipSpaces();
      entries[key] = this.value();
    }
  }

  private stream(): PdfValue {
    const m = /^stream\((\d+),([0-9a-fA-F]*)\)/.exec(this.text.slice(this.pos));
    if (!m) throw new Error(`malformed stream signature at ${this.pos}`);
    this.pos += m[0].length;
    const dict = this.dictEntries();
    return { t: 'stream', length: Number(m[1]), sha256: m[2].toLowerCase(), dict };
  }

  private array(): PdfValue {
    this.expect('[');
    const items: PdfValue[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.text[this.pos] === ']') {
        this.pos++;
        return { t: 'array', items };
      }
      items.push(this.value());
    }
  }

  private name(): string {
    this.expect('/');
    let out = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === ' ' || ch === '/' || ch === '[' || ch === ']' || ch === '<' || ch === '>' || ch === '(' || ch === ')') {
        break;
      }
      if (ch === '#' && /^[0-9A-Fa-f]{2}/.test(this.text.slice(this.pos + 1, this.pos + 3))) {
        out += String.fromCharCode(parseInt(this.text.slice(this.pos + 1, this.pos + 3), 16));
        this.pos += 3;
        continue;
      }
      out += ch;
      this.pos++;
    }
    return out;
  }

  private literalString(): string {
    this.expect('(');
    let depth = 1;
    let out = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos++];
      if (ch === '\\') {
        const next = this.text[this.pos++];
        switch (next) {
          case 'n':
            out += '\n';
            break;
          case 'r':
            out += '\r';
            break;
          case 't':
            out += '\t';
            break;
          case 'b':
            out += '\b';
            break;
          case 'f':
            out += '\f';
            break;
          case '\n':
            break;
          case '\r':
            if (this.text[this.pos] === '\n') this.pos++;
            break;
          default: {
            const oct = /^[0-7]{1,3}/.exec(this.text.slice(this.pos - 1));
            if (oct) {
              out += String.fromCharCode(parseInt(oct[0], 8));
              this.pos += oct[0].length - 1;
            } else {
              out += next;
            }
          }
        }
        continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') {
        depth--;
        if (depth === 0) return out;
      }
      out += ch;
    }
    throw new Error('unterminated string');
  }

  private hexString(): string {
    this.expect('<');
    const end = this.text.indexOf('>', this.pos);
    if (end < 0) throw new Error('unterminated hex string');
    const hex = this.text.slice(this.pos, end).replace(/\s+/g, '');
    this.pos = end + 1;
    let out = '';
    for (let i = 0; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16));
    }
    return out;
  }

  private expect(token: string): void {
    if (!this.text.startsWith(token, this.pos)) throw new Error(`expected ${token} at ${this.pos}`);
    this.pos += token.length;
  }
}

/** Structural equality of two parsed values. */
export function pdfValueEquals(a: PdfValue | null, b: PdfValue | null): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function stableStringify(value: PdfValue | null): string {
  if (value === null) return 'null';
  switch (value.t) {
    case 'dict':
      return `<<${Object.keys(value.entries)
        .sort()
        .map((k) => `/${k} ${stableStringify(value.entries[k])}`)
        .join('')}>>`;
    case 'stream':
      return `stream(${value.length},${value.sha256})${stableStringify({ t: 'dict', entries: value.dict })}`;
    case 'array':
      return `[${value.items.map(stableStringify).join(' ')}]`;
    case 'ref':
      return `${value.num} 0 R`;
    case 'name':
      return `/${encodeName(value.v)}`;
    case 'string':
      return `(${value.v.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
    case 'number':
      return String(value.v);
    case 'bool':
      return value.v ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

export function dictEntries(value: PdfValue | null): Record<string, PdfValue> | null {
  if (!value) return null;
  if (value.t === 'dict') return value.entries;
  if (value.t === 'stream') return value.dict;
  return null;
}

/** Keys whose value differs (added, removed, or changed) between two dictionaries. */
export function changedKeys(a: PdfValue | null, b: PdfValue | null): Set<string> {
  const ea = dictEntries(a) ?? {};
  const eb = dictEntries(b) ?? {};
  const out = new Set<string>();
  for (const key of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
    if (!pdfValueEquals(ea[key] ?? null, eb[key] ?? null)) out.add(key);
  }
  return out;
}

export function refsOf(value: PdfValue | null | undefined): number[] {
  if (!value) return [];
  if (value.t === 'ref') return [value.num];
  if (value.t === 'array') return value.items.flatMap(refsOf);
  return [];
}

/** `#xx`-escape a name the way the PDF writer does: delimiters, whitespace, `#`, and non-printables. */
export function encodeName(name: string): string {
  let out = '';
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || '#/[]<>(){}%'.includes(ch)) {
      out += `#${code.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      out += ch;
    }
  }
  return out;
}
