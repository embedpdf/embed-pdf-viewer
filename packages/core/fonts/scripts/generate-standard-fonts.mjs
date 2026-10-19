#!/usr/bin/env node
/**
 * The 14 standard fonts as the engine draws them, generated from the fork.
 *
 * PDFium draws a standard font that a document doesn't embed with one of its
 * own built-in faces (bare CFF, `core/fxge/fontdata/chromefontdata`). This
 * script reads those faces and writes, for each one:
 *
 * - its display program: the CFF in an OpenType font a browser can load, with
 *   a cmap that reaches exactly the glyphs the engine's encoding reaches, the
 *   face's widths in `hmtx`, its ascent and descent in `hhea` and `OS/2`, and
 *   PDFium's notice in `name` (src/standard/programs/*.generated.ts);
 * - the numbers the engine lays text out with: each character's advance, and
 *   the ascent and descent (src/standard/faces.generated.ts).
 *
 * It follows PDFium's own chain for a standard font without `/Widths` or a
 * font descriptor (the generator's font dictionaries, and Acrobat's `/Helv`):
 * a character becomes a code through the encoding (WinAnsi for the 12 text
 * faces, each symbol face's own), the code's glyph name is looked up in the
 * face, and the advance is the glyph's width (`CPDF_SimpleFont`,
 * `CPDF_Type1Font::LoadGlyphMap`). The ascent and descent are the face's, as
 * FreeType gives them for a bare CFF face: the font box's top and bottom
 * (`CPDF_Font::CheckFontMetrics`).
 *
 * It also writes the last-resort program: one box glyph that every code
 * point outside the surrogates maps to (a format 13 cmap, as Unicode's Last
 * Resort and Adobe NotDef map them), so a character no font has shows as a
 * box in a browser, as the engine draws it (src/last-resort.generated.ts).
 *
 * Run it after the fork's font data changes:
 *   node packages/core/fonts/scripts/generate-standard-fonts.mjs
 * `--check` compares instead of writing (the test runs it).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '..');
const RUNTIME_SRC = resolve(PACKAGE, '../../engine/runtime/runtime-src');
const FONT_DATA = join(RUNTIME_SRC, 'core/fxge/fontdata/chromefontdata');
const ENCODINGS = join(RUNTIME_SRC, 'core/fpdfapi/font/cpdf_fontencoding.cpp');
const PS_TABLES = join(RUNTIME_SRC, 'third_party/freetype/src/src/psnames/pstables.h');
const OUT = join(PACKAGE, 'src/standard');

/** In PDFium's order (`CFX_FontMapper::StandardFont`), named as engine-core names them. */
const FACES = [
  { font: 'courier', file: 'FoxitFixed', family: 'Mono', style: 'Regular', fixed: true },
  { font: 'courier-bold', file: 'FoxitFixedBold', family: 'Mono', style: 'Bold', fixed: true },
  {
    font: 'courier-bold-oblique',
    file: 'FoxitFixedBoldItalic',
    family: 'Mono',
    style: 'Bold Italic',
    fixed: true,
  },
  {
    font: 'courier-oblique',
    file: 'FoxitFixedItalic',
    family: 'Mono',
    style: 'Italic',
    fixed: true,
  },
  { font: 'helvetica', file: 'FoxitSans', family: 'Sans', style: 'Regular' },
  { font: 'helvetica-bold', file: 'FoxitSansBold', family: 'Sans', style: 'Bold' },
  {
    font: 'helvetica-bold-oblique',
    file: 'FoxitSansBoldItalic',
    family: 'Sans',
    style: 'Bold Italic',
  },
  { font: 'helvetica-oblique', file: 'FoxitSansItalic', family: 'Sans', style: 'Italic' },
  { font: 'times-roman', file: 'FoxitSerif', family: 'Serif', style: 'Regular' },
  { font: 'times-bold', file: 'FoxitSerifBold', family: 'Serif', style: 'Bold' },
  {
    font: 'times-bold-italic',
    file: 'FoxitSerifBoldItalic',
    family: 'Serif',
    style: 'Bold Italic',
  },
  { font: 'times-italic', file: 'FoxitSerifItalic', family: 'Serif', style: 'Italic' },
  { font: 'symbol', file: 'FoxitSymbol', family: 'Symbol', style: 'Regular', encoding: 'symbol' },
  {
    font: 'zapf-dingbats',
    file: 'FoxitDingbats',
    family: 'Dingbats',
    style: 'Regular',
    encoding: 'zapf',
  },
];

const COPYRIGHT =
  'Copyright 2014 The PDFium Authors. Original code copyright 2014 Foxit Software Inc.';
const LICENSE =
  'Use of this font is governed by the BSD-style license of PDFium: ' +
  'https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE';
const LICENSE_URL = 'https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE';

// ── reading the fork's sources ────────────────────────────────────────────────

/** A `std::array<uint8_t, N> kName = {{ 0x.., … }};` as bytes. */
function readFontData(file) {
  const source = readFileSync(join(FONT_DATA, `${file}.cpp`), 'utf8');
  const body = source.slice(source.indexOf('{{'), source.lastIndexOf('}}'));
  return Uint8Array.from(body.match(/0x[0-9a-fA-F]+/g), (hex) => parseInt(hex, 16));
}

/** A `const uint16_t kName[…] = { 0x…, … };` table. */
function readUnicodeTable(source, name) {
  const start = source.indexOf(`${name}[`);
  if (start < 0) throw new Error(`no table ${name}`);
  const body = source.slice(source.indexOf('{', start), source.indexOf('};', start));
  const values = body.match(/0x[0-9a-fA-F]+/g).map((hex) => parseInt(hex, 16));
  if (values.length !== 256) throw new Error(`${name} has ${values.length} entries`);
  return values;
}

/** A `kName = {{ "space", nullptr, … }}` names table: the names of codes 32 to 255. */
function readNamesTable(source, name) {
  const start = source.search(new RegExp(`\\b${name}\\s*=`));
  if (start < 0) throw new Error(`no table ${name}`);
  const body = source.slice(source.indexOf('{{', start), source.indexOf('}}', start));
  const names = [...body.matchAll(/"([^"]*)"|nullptr/g)].map((match) =>
    match[0] === 'nullptr' ? null : match[1],
  );
  if (names.length !== 224) throw new Error(`${name} has ${names.length} entries`);
  return [...new Array(32).fill(null), ...names];
}

/** FreeType's standard glyph names by SID (the CFF standard strings). */
function readStandardStrings() {
  const source = readFileSync(PS_TABLES, 'utf8');
  const namesStart = source.indexOf('ft_standard_glyph_names[');
  // Each table is `= { … }` between `#ifdef DEFINE_PS_TABLES_DATA` and `#endif`.
  const namesBody = source.slice(
    source.indexOf('{', namesStart),
    source.indexOf('\n  }', namesStart),
  );
  const chars = [...namesBody.matchAll(/'(\\.|[^'])'|\b0\b/g)].map((match) =>
    match[0] === '0' ? '\0' : match[1].replace(/^\\/, ''),
  );
  const pool = chars.join('');
  const sidStart = source.indexOf('ft_sid_names[');
  const sidBody = source.slice(source.indexOf('{', sidStart), source.indexOf('\n  }', sidStart));
  const offsets = sidBody.match(/\d+/g).map(Number);
  if (offsets.length !== 391) throw new Error(`ft_sid_names has ${offsets.length} entries`);
  return offsets.map((offset) => pool.slice(offset, pool.indexOf('\0', offset)));
}

// ── CFF ───────────────────────────────────────────────────────────────────────

const int16 = (high, low) => (((high << 8) | low) << 16) >> 16;
const int32 = (bytes, at) =>
  (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];

function readIndex(bytes, at) {
  const count = (bytes[at] << 8) | bytes[at + 1];
  if (count === 0) return { items: [], end: at + 2 };
  const offSize = bytes[at + 2];
  let position = at + 3;
  const offsets = [];
  for (let index = 0; index <= count; index += 1) {
    let value = 0;
    for (let byte = 0; byte < offSize; byte += 1) value = value * 256 + bytes[position++];
    offsets.push(value);
  }
  const base = position - 1;
  const items = [];
  for (let index = 0; index < count; index += 1) {
    items.push(bytes.subarray(base + offsets[index], base + offsets[index + 1]));
  }
  return { items, end: base + offsets[count] };
}

function readReal(bytes, at) {
  const NIBBLES = '0123456789.EE?-';
  let text = '';
  let position = at;
  for (;;) {
    const byte = bytes[position++];
    for (const nibble of [byte >> 4, byte & 15]) {
      if (nibble === 15) return { value: Number(text), end: position };
      text += nibble === 12 ? 'E-' : NIBBLES[nibble];
    }
  }
}

/** A DICT as operator → operands; an escaped operator `12 x` is `1200 + x`. */
function readDict(bytes) {
  const dict = new Map();
  let operands = [];
  let position = 0;
  while (position < bytes.length) {
    const b0 = bytes[position];
    if (b0 <= 21) {
      let operator = b0;
      position += 1;
      if (b0 === 12) operator = 1200 + bytes[position++];
      dict.set(operator, operands);
      operands = [];
    } else if (b0 === 28) {
      operands.push(int16(bytes[position + 1], bytes[position + 2]));
      position += 3;
    } else if (b0 === 29) {
      operands.push(int32(bytes, position + 1));
      position += 5;
    } else if (b0 === 30) {
      const real = readReal(bytes, position + 1);
      operands.push(real.value);
      position = real.end;
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push(b0 - 139);
      position += 1;
    } else if (b0 >= 247 && b0 <= 250) {
      operands.push((b0 - 247) * 256 + bytes[position + 1] + 108);
      position += 2;
    } else if (b0 >= 251 && b0 <= 254) {
      operands.push(-(b0 - 251) * 256 - bytes[position + 1] - 108);
      position += 2;
    } else {
      throw new Error(`DICT byte ${b0}`);
    }
  }
  return dict;
}

const subrBias = (count) => (count < 1240 ? 107 : count < 33900 ? 1131 : 32768);

/**
 * A glyph's width from its Type 2 charstring, as FreeType reads it: the
 * first stack-clearing operator carries one operand too many when the glyph
 * says its width (`nominalWidthX` plus that operand), else `defaultWidthX`.
 */
function glyphWidth(charstring, font) {
  const stack = [];
  let width = null;
  const run = (bytes) => {
    let position = 0;
    while (position < bytes.length) {
      const b0 = bytes[position];
      if (b0 === 28) {
        stack.push(int16(bytes[position + 1], bytes[position + 2]));
        position += 3;
        continue;
      }
      if (b0 >= 32 && b0 <= 246) {
        stack.push(b0 - 139);
        position += 1;
        continue;
      }
      if (b0 >= 247 && b0 <= 250) {
        stack.push((b0 - 247) * 256 + bytes[position + 1] + 108);
        position += 2;
        continue;
      }
      if (b0 >= 251 && b0 <= 254) {
        stack.push(-(b0 - 251) * 256 - bytes[position + 1] - 108);
        position += 2;
        continue;
      }
      if (b0 === 255) {
        stack.push(int32(bytes, position + 1) / 65536);
        position += 5;
        continue;
      }
      position += 1;
      switch (b0) {
        case 10: // callsubr
          if (run(font.subrs[stack.pop() + font.localBias])) return true;
          break;
        case 29: // callgsubr
          if (run(font.globalSubrs[stack.pop() + font.globalBias])) return true;
          break;
        case 11: // return
          return false;
        case 1: // hstem
        case 3: // vstem
        case 18: // hstemhm
        case 23: // vstemhm
        case 19: // hintmask
        case 20: // cntrmask
          width = stack.length % 2 === 1 ? stack[0] : null;
          return true;
        case 21: // rmoveto
          width = stack.length > 2 ? stack[0] : null;
          return true;
        case 4: // vmoveto
        case 22: // hmoveto
          width = stack.length > 1 ? stack[0] : null;
          return true;
        case 14: // endchar
          width = stack.length === 1 || stack.length === 5 ? stack[0] : null;
          return true;
        default:
          throw new Error(`charstring operator ${b0} before the width`);
      }
    }
    return false;
  };
  run(charstring);
  return width === null
    ? Math.floor(font.defaultWidthX)
    : Math.floor(font.nominalWidthX) + Math.floor(width);
}

/** ISOAdobe: glyph i is SID i. */
const ISO_ADOBE_SIDS = Array.from({ length: 229 }, (_, sid) => sid);

function readCharset(bytes, offset, glyphCount) {
  const sids = [0];
  if (offset === 0) return ISO_ADOBE_SIDS.slice(0, glyphCount);
  if (offset === 1 || offset === 2) throw new Error('expert charsets are not used here');
  const format = bytes[offset];
  let position = offset + 1;
  if (format === 0) {
    while (sids.length < glyphCount) {
      sids.push((bytes[position] << 8) | bytes[position + 1]);
      position += 2;
    }
  } else if (format === 1 || format === 2) {
    while (sids.length < glyphCount) {
      const first = (bytes[position] << 8) | bytes[position + 1];
      const left =
        format === 1 ? bytes[position + 2] : (bytes[position + 2] << 8) | bytes[position + 3];
      position += format === 1 ? 3 : 4;
      for (let sid = first; sid <= first + left && sids.length < glyphCount; sid += 1) {
        sids.push(sid);
      }
    }
  } else {
    throw new Error(`charset format ${format}`);
  }
  return sids;
}

function readCff(bytes, standardStrings) {
  const headerSize = bytes[2];
  const names = readIndex(bytes, headerSize);
  const topDicts = readIndex(bytes, names.end);
  const strings = readIndex(bytes, topDicts.end);
  const globalSubrs = readIndex(bytes, strings.end);
  if (names.items.length !== 1) throw new Error('one font per CFF expected');
  const top = readDict(topDicts.items[0]);
  if (top.has(1230)) throw new Error('CID-keyed CFF is not expected here');
  if ((top.get(1206)?.[0] ?? 2) !== 2) throw new Error('Type 2 charstrings expected');
  const matrix = top.get(1207) ?? [0.001, 0, 0, 0.001, 0, 0];
  const unitsPerEm = Math.round(1 / matrix[0]);
  const charStrings = readIndex(bytes, top.get(17)[0]).items;
  const [privateSize, privateOffset] = top.get(18);
  const privateDict = readDict(bytes.subarray(privateOffset, privateOffset + privateSize));
  const subrs = privateDict.has(19)
    ? readIndex(bytes, privateOffset + privateDict.get(19)[0]).items
    : [];
  const font = {
    subrs,
    globalSubrs: globalSubrs.items,
    localBias: subrBias(subrs.length),
    globalBias: subrBias(globalSubrs.items.length),
    defaultWidthX: privateDict.get(20)?.[0] ?? 0,
    nominalWidthX: privateDict.get(21)?.[0] ?? 0,
  };
  const stringOf = (sid) =>
    sid < 391 ? standardStrings[sid] : new TextDecoder('latin1').decode(strings.items[sid - 391]);
  const sids = readCharset(bytes, top.get(15)?.[0] ?? 0, charStrings.length);
  const glyphNames = sids.map(stringOf);
  const bbox = top.get(5) ?? [0, 0, 0, 0];
  return {
    name: new TextDecoder('latin1').decode(names.items[0]),
    unitsPerEm,
    glyphNames,
    widths: charStrings.map((charstring) => glyphWidth(charstring, font)),
    bbox,
    italicAngle: top.get(1202)?.[0] ?? 0,
    underlinePosition: top.get(1203)?.[0] ?? -100,
    underlineThickness: top.get(1204)?.[0] ?? 50,
    isFixedPitch: (top.get(1201)?.[0] ?? 0) !== 0,
  };
}

/** PDFium's `NormalizeFontMetric`: font units to 1/1000 em, rounded. */
const normalize = (value, unitsPerEm) => Math.trunc((value * 1000 + unitsPerEm / 2) / unitsPerEm);

// ── what the engine lays out with ─────────────────────────────────────────────

/**
 * Each character the face's encoding can write, with the glyph it reaches and
 * its advance, the way PDFium works it out: the first code whose character
 * it is, that code's glyph name looked up in the face. Courier's advances are
 * 600 whatever the glyph says (`CPDF_Type1Font::Load`, a fixed-pitch font).
 */
function layoutOf(face, cff, encoding) {
  const glyphByName = new Map();
  cff.glyphNames.forEach((name, gid) => {
    if (!glyphByName.has(name)) glyphByName.set(name, gid);
  });
  const spaceGlyph = glyphByName.get('space');
  const characters = [];
  const seen = new Set();
  for (let code = 32; code < 256; code += 1) {
    const name = encoding.names[code];
    const codePoint = encoding.unicodes[code];
    if (!name || !codePoint || seen.has(codePoint)) continue;
    seen.add(codePoint);
    let gid = glyphByName.get(name);
    if (gid === undefined) {
      // PDFium gives a space or `.notdef` the face lacks the space's metrics;
      // any other missing name it looks up by character, which these faces
      // never need (the check below says so).
      if (name !== 'space' && name !== '.notdef') {
        throw new Error(`${face.font}: no glyph ${name} for U+${codePoint.toString(16)}`);
      }
      if (spaceGlyph === undefined) throw new Error(`${face.font}: no space`);
      gid = null;
    }
    const advance = face.fixed ? 600 : normalize(cff.widths[gid ?? spaceGlyph], cff.unitsPerEm);
    characters.push({ codePoint, gid, advance });
  }
  return characters;
}

// ── OpenType ──────────────────────────────────────────────────────────────────

class Writer {
  constructor() {
    this.bytes = [];
  }
  u8(value) {
    this.bytes.push(value & 0xff);
    return this;
  }
  u16(value) {
    return this.u8(value >> 8).u8(value);
  }
  i16(value) {
    return this.u16(value < 0 ? value + 0x10000 : value);
  }
  u32(value) {
    return this.u16(Math.floor(value / 0x10000) & 0xffff).u16(value & 0xffff);
  }
  fixed(value) {
    const raw = Math.round(value * 65536);
    return this.u32(raw < 0 ? raw + 0x100000000 : raw);
  }
  tag(text) {
    for (const char of text) this.u8(char.charCodeAt(0));
    return this;
  }
  zeros(count) {
    for (let index = 0; index < count; index += 1) this.u8(0);
    return this;
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

const checksum = (bytes) => {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    const word =
      ((bytes[index] ?? 0) << 24) |
      ((bytes[index + 1] ?? 0) << 16) |
      ((bytes[index + 2] ?? 0) << 8) |
      (bytes[index + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
};

/** cmap: one format 4 subtable (Windows, Unicode BMP), one segment per character. */
function cmapTable(mapping) {
  const entries = [...mapping].sort((left, right) => left[0] - right[0]);
  const segments = [...entries.map(([code, gid]) => ({ start: code, end: code, gid })), null];
  const segCount = segments.length;
  const searchRange = 2 ** Math.floor(Math.log2(segCount)) * 2;
  const sub = new Writer();
  const length = 16 + segCount * 8;
  sub.u16(4).u16(length).u16(0);
  sub
    .u16(segCount * 2)
    .u16(searchRange)
    .u16(Math.log2(searchRange / 2));
  sub.u16(segCount * 2 - searchRange);
  for (const segment of segments) sub.u16(segment ? segment.end : 0xffff);
  sub.u16(0);
  for (const segment of segments) sub.u16(segment ? segment.start : 0xffff);
  for (const segment of segments) sub.u16(segment ? (segment.gid - segment.start) & 0xffff : 1);
  for (let index = 0; index < segCount; index += 1) sub.u16(0);
  const table = new Writer().u16(0).u16(1).u16(3).u16(1).u32(12);
  return Uint8Array.from([...table.done(), ...sub.done()]);
}

function nameTable(records) {
  const strings = records.map(([, text]) => {
    const bytes = [];
    for (const char of text) bytes.push(char.charCodeAt(0) >> 8, char.charCodeAt(0) & 0xff);
    return bytes;
  });
  const writer = new Writer()
    .u16(0)
    .u16(records.length)
    .u16(6 + records.length * 12);
  let offset = 0;
  records.forEach(([nameId], index) => {
    writer.u16(3).u16(1).u16(0x409).u16(nameId).u16(strings[index].length).u16(offset);
    offset += strings[index].length;
  });
  return Uint8Array.from([...writer.done(), ...strings.flat()]);
}

/** An sfnt from its tables: the table directory, each table padded, `head`'s checksum adjustment. */
function sfnt(version, tables) {
  const tags = Object.keys(tables).sort();
  const searchRange = 2 ** Math.floor(Math.log2(tags.length)) * 16;
  const directory = new Writer()
    .u32(version)
    .u16(tags.length)
    .u16(searchRange)
    .u16(Math.log2(searchRange / 16))
    .u16(tags.length * 16 - searchRange);
  let offset = 12 + tags.length * 16;
  const body = [];
  let headOffset = 0;
  for (const tag of tags) {
    const table = tables[tag];
    if (tag === 'head') headOffset = offset;
    directory.tag(tag).u32(checksum(table)).u32(offset).u32(table.length);
    const padded = Uint8Array.from([...table, ...new Array((4 - (table.length % 4)) % 4).fill(0)]);
    body.push(padded);
    offset += padded.length;
  }
  const font = Uint8Array.from([...directory.done(), ...body.flatMap((part) => [...part])]);
  const adjustment = (0xb1b0afba - checksum(font)) >>> 0;
  font.set(
    [adjustment >>> 24, (adjustment >>> 16) & 255, (adjustment >>> 8) & 255, adjustment & 255],
    headOffset + 8,
  );
  return font;
}

/**
 * The last-resort program: glyph 1 is a box (an outlined rectangle), and a
 * format 13 cmap maps every code point from U+0020 up, surrogates left out,
 * to it. TrueType outlines, so it has no CFF to parse; an OS/2 table, which
 * browsers' font sanitizers require.
 */
function lastResortFont() {
  const box = [
    // outer contour, clockwise
    [60, 0],
    [60, 700],
    [640, 700],
    [640, 0],
    // inner contour, counterclockwise: the hole
    [580, 60],
    [580, 640],
    [120, 640],
    [120, 60],
  ];
  const glyph = new Writer().i16(2).i16(60).i16(0).i16(640).i16(700).u16(3).u16(7).u16(0);
  for (let index = 0; index < box.length; index += 1) glyph.u8(0x01); // on-curve, long deltas
  let previous = [0, 0];
  for (const [x] of box) {
    glyph.i16(x - previous[0]);
    previous = [x, previous[1]];
  }
  previous = [0, 0];
  for (const [, y] of box) {
    glyph.i16(y - previous[1]);
    previous = [previous[0], y];
  }
  const glyf = glyph.done();
  const loca = new Writer()
    .u16(0)
    .u16(0)
    .u16(glyf.length / 2)
    .done();
  const head = new Writer()
    .fixed(1)
    .fixed(1)
    .u32(0) // checkSumAdjustment, set by sfnt()
    .u32(0x5f0f3cf5)
    .u16(0x0003)
    .u16(1000)
    .zeros(16) // created, modified: none, so the bytes are the same every run
    .i16(60)
    .i16(0)
    .i16(640)
    .i16(700)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(0) // short loca offsets
    .i16(0)
    .done();
  const hhea = new Writer()
    .fixed(1)
    .i16(800)
    .i16(-200)
    .i16(0)
    .u16(700)
    .i16(0)
    .i16(0)
    .i16(640)
    .i16(1)
    .i16(0)
    .i16(0)
    .zeros(8)
    .i16(0)
    .u16(2)
    .done();
  const hmtx = new Writer().u16(600).i16(0).u16(700).i16(60).done();
  const maxp = new Writer()
    .fixed(1)
    .u16(2) // glyphs
    .u16(8) // points
    .u16(2) // contours
    .u16(0)
    .u16(0)
    .u16(2) // zones
    .zeros(16)
    .done();
  const os2 = new Writer()
    .u16(4)
    .i16(700)
    .u16(400)
    .u16(5)
    .u16(0) // fsType: installable
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(75)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(350)
    .i16(50)
    .i16(250)
    .i16(0)
    .zeros(10) // panose
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .tag('EPDF')
    .u16(0x40 | 0x80)
    .u16(0x20)
    .u16(0xffff)
    .i16(800)
    .i16(-200)
    .i16(0)
    .u16(800)
    .u16(200)
    .u32(0)
    .u32(0)
    .i16(500)
    .i16(700)
    .u16(0)
    .u16(32)
    .u16(1)
    .done();
  const groups = [
    [0x20, 0xd7ff],
    [0xe000, 0x10ffff],
  ];
  const cmap = new Writer()
    .u16(0)
    .u16(1)
    .u16(3)
    .u16(10)
    .u32(12)
    .u16(13)
    .u16(0)
    .u32(16 + groups.length * 12)
    .u32(0)
    .u32(groups.length);
  for (const [start, end] of groups) cmap.u32(start).u32(end).u32(1);
  const post = new Writer().fixed(3).fixed(0).i16(-100).i16(50).u32(0).zeros(16).done();
  const name = nameTable([
    [0, 'Copyright 2026 CloudPDF LTD'],
    [1, 'EmbedPDF Last Resort'],
    [2, 'Regular'],
    [3, 'EmbedPDFLastResort-Regular'],
    [4, 'EmbedPDF Last Resort'],
    [5, 'Version 1.000'],
    [6, 'EmbedPDFLastResort-Regular'],
    [13, 'Licensed under the Apache License, Version 2.0'],
    [14, 'https://www.apache.org/licenses/LICENSE-2.0'],
  ]);
  return sfnt(0x00010000, {
    'OS/2': os2,
    cmap: cmap.done(),
    glyf,
    head,
    hhea,
    hmtx,
    loca,
    maxp,
    name,
    post,
  });
}

function openType(face, cffBytes, cff, characters, encodingOf) {
  const glyphCount = cff.glyphNames.length;
  const widths = cff.widths.map((width) => (face.fixed ? 600 : normalize(width, cff.unitsPerEm)));
  const [xMin, yMin, xMax, yMax] = cff.bbox;
  const ascent = normalize(Math.ceil(yMax), cff.unitsPerEm);
  const descent = normalize(Math.floor(yMin), cff.unitsPerEm);
  const bold = face.style.includes('Bold');
  const italic = face.style.includes('Italic');
  const mapping = new Map(
    characters.filter((character) => character.gid !== null).map((c) => [c.codePoint, c.gid]),
  );
  const codePoints = [...mapping.keys()];
  const familyName = `EmbedPDF Standard ${face.family}`;
  const fullName = face.style === 'Regular' ? familyName : `${familyName} ${face.style}`;
  const postScriptName = fullName.replace(/ /g, '');

  const head = new Writer()
    .fixed(1)
    .fixed(1)
    .u32(0) // checkSumAdjustment, set below
    .u32(0x5f0f3cf5)
    .u16(0x0003)
    .u16(1000)
    .zeros(16) // created, modified: none, so the bytes are the same every run
    .i16(Math.floor(xMin))
    .i16(Math.floor(yMin))
    .i16(Math.ceil(xMax))
    .i16(Math.ceil(yMax))
    .u16((bold ? 1 : 0) | (italic ? 2 : 0))
    .u16(8)
    .i16(2)
    .i16(0)
    .i16(0)
    .done();
  const hhea = new Writer()
    .fixed(1)
    .i16(ascent)
    .i16(descent)
    .i16(0)
    .u16(Math.max(...widths))
    .i16(0)
    .i16(0)
    .i16(Math.ceil(xMax))
    .i16(1)
    .i16(0)
    .i16(0)
    .zeros(8)
    .i16(0)
    .u16(glyphCount)
    .done();
  const hmtx = new Writer();
  for (const width of widths) hmtx.u16(width).i16(0);
  const maxp = new Writer().u32(0x00005000).u16(glyphCount).done();
  const nonZero = widths.filter((width) => width > 0);
  const os2 = new Writer()
    .u16(4)
    .i16(Math.round(nonZero.reduce((sum, width) => sum + width, 0) / nonZero.length))
    .u16(bold ? 700 : 400)
    .u16(5)
    .u16(0) // fsType: installable
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(75)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(350)
    .i16(50)
    .i16(250)
    .i16(0)
    .zeros(10) // panose
    .u32(encodingOf === 'winansi' ? 0x00000007 : 0)
    .u32(0)
    .u32(0)
    .u32(0)
    .tag('EPDF')
    .u16((italic ? 1 : 0) | (bold ? 0x20 : 0) | (!bold && !italic ? 0x40 : 0) | 0x80)
    .u16(Math.min(...codePoints))
    .u16(Math.max(...codePoints))
    .i16(ascent)
    .i16(descent)
    .i16(0)
    .u16(Math.max(ascent, 0))
    .u16(Math.max(-descent, 0))
    .u32(encodingOf === 'winansi' ? 1 : 0x80000000)
    .u32(0)
    .i16(0)
    .i16(0)
    .u16(0)
    .u16(32)
    .u16(1)
    .done();
  const post = new Writer()
    .fixed(3)
    .fixed(cff.italicAngle)
    .i16(cff.underlinePosition)
    .i16(cff.underlineThickness)
    .u32(cff.isFixedPitch || face.fixed ? 1 : 0)
    .zeros(16)
    .done();
  const name = nameTable([
    [0, COPYRIGHT],
    [1, familyName],
    [2, face.style],
    [3, `${postScriptName};${cff.name}`],
    [4, fullName],
    [5, 'Version 1.000'],
    [6, postScriptName],
    [13, LICENSE],
    [14, LICENSE_URL],
  ]);
  const tables = {
    'CFF ': cffBytes,
    'OS/2': os2,
    cmap: cmapTable(mapping),
    head,
    hhea,
    hmtx: hmtx.done(),
    maxp,
    name,
    post,
  };
  const font = sfnt(0x4f54544f, tables); // 'OTTO'
  return { font, ascent, descent };
}

// ── output ────────────────────────────────────────────────────────────────────

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const BANNER = `// Generated by packages/core/fonts/scripts/generate-standard-fonts.mjs from the fork's font data. Don't edit.\n`;

function generate() {
  if (!existsSync(FONT_DATA)) throw new Error(`the fork's font data isn't here: ${FONT_DATA}`);
  const encodingSource = readFileSync(ENCODINGS, 'utf8');
  const encodings = {
    winansi: {
      names: readNamesTable(encodingSource, 'kAdobeWinAnsiEncodingNames'),
      unicodes: readUnicodeTable(encodingSource, 'kAdobeWinAnsiEncoding'),
    },
    symbol: {
      names: readNamesTable(encodingSource, 'kAdobeSymbolEncodingNames'),
      unicodes: readUnicodeTable(encodingSource, 'kAdobeSymbolEncoding'),
    },
    zapf: {
      names: readNamesTable(encodingSource, 'kZapfEncodingNames'),
      unicodes: readUnicodeTable(encodingSource, 'kZapfEncoding'),
    },
  };
  const standardStrings = readStandardStrings();
  const sourceHash = createHash('sha256');
  const files = new Map();
  const faces = [];
  for (const face of FACES) {
    const bytes = readFontData(face.file);
    sourceHash.update(bytes);
    const cff = readCff(bytes, standardStrings);
    if (cff.unitsPerEm !== 1000) throw new Error(`${face.font}: ${cff.unitsPerEm} units per em`);
    const encodingOf = face.encoding ?? 'winansi';
    const characters = layoutOf(face, cff, encodings[encodingOf]);
    const { font, ascent, descent } = openType(face, bytes, cff, characters, encodingOf);
    const hash = sha256(font);
    files.set(
      `programs/${face.font}.generated.ts`,
      `${BANNER}export default '${Buffer.from(font).toString('base64')}';\n`,
    );
    faces.push({ face, ascent, descent, hash, characters });
  }

  // The 12 text faces write the same characters: one list, one advance list per face.
  const winAnsi = faces.find((entry) => entry.face.font === 'helvetica').characters;
  const sharedCodePoints = winAnsi.map((character) => character.codePoint);
  const entries = faces.map(({ face, ascent, descent, hash, characters }) => {
    const codePoints = characters.map((character) => character.codePoint);
    const shared = codePoints.join() === sharedCodePoints.join();
    return [
      `  '${face.font}': {`,
      `    ascent: ${ascent},`,
      `    descent: ${descent},`,
      `    programHash: '${hash}',`,
      `    codePoints: ${shared ? 'WIN_ANSI' : JSON.stringify(codePoints)},`,
      `    advances: ${JSON.stringify(characters.map((character) => character.advance))},`,
      `  },`,
    ].join('\n');
  });
  const lastResort = lastResortFont();
  files.set(
    '../last-resort.generated.ts',
    [
      `// Generated by packages/core/fonts/scripts/generate-standard-fonts.mjs. Don't edit.`,
      ``,
      `/** SHA-256 of the last-resort program. */`,
      `export const LAST_RESORT_HASH = '${sha256(lastResort)}';`,
      ``,
      `/** The last-resort program, base64. */`,
      `export const LAST_RESORT_PROGRAM = '${Buffer.from(lastResort).toString('base64')}';`,
      ``,
    ].join('\n'),
  );
  files.set(
    'faces.generated.ts',
    [
      BANNER,
      `import type { StandardFont } from '@embedpdf/engine-core/runtime';`,
      ``,
      `import type { StandardFaceData } from './types';`,
      ``,
      `/** The SHA-256 of the fork's font data these were generated from. */`,
      `export const SOURCE_HASH = '${sourceHash.digest('hex')}';`,
      ``,
      `/** The characters WinAnsi writes, in code order: the 12 text faces'. */`,
      `const WIN_ANSI: readonly number[] = ${JSON.stringify(sharedCodePoints)};`,
      ``,
      `export const FACES: Readonly<Record<StandardFont, StandardFaceData>> = {`,
      ...entries,
      `};`,
      ``,
    ].join('\n'),
  );
  return files;
}

const check = process.argv.includes('--check');
const files = generate();
let stale = 0;
for (const [path, text] of files) {
  const target = join(OUT, path);
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
      console.error(`stale: ${path}`);
      stale += 1;
    }
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}
if (check && stale) {
  console.error('run: node packages/core/fonts/scripts/generate-standard-fonts.mjs');
  process.exit(1);
}
if (!check) console.log(`wrote ${files.size} files to ${OUT}`);
