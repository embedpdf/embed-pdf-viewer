/**
 * The standard faces as generated: the files are what the fork's font data
 * gives, the layout numbers are the engine's, and each program is an
 * OpenType font whose characters reach the glyphs, and advances, the engine
 * lays out with.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STANDARD_FONTS } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  LAST_RESORT_METRICS,
  lastResortFontBytes,
  standardFontCss,
  standardFontMetrics,
  standardFontProgram,
} from '../src';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DATA = resolve(HERE, '../../../engine/runtime/runtime-src/core/fxge/fontdata');

/** Just enough of an OpenType reader: the tables, a cmap lookup, the advances. */
function readOpenType(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const tables = new Map<string, { offset: number; length: number; checksum: number }>();
  const count = view.getUint16(4);
  for (let index = 0; index < count; index += 1) {
    const at = 12 + index * 16;
    tables.set(tag(at), {
      checksum: view.getUint32(at + 4),
      offset: view.getUint32(at + 8),
      length: view.getUint32(at + 12),
    });
  }
  const sum = (offset: number, length: number) => {
    let total = 0;
    for (let at = offset; at < offset + length; at += 4) {
      const word =
        ((bytes[at] ?? 0) << 24) |
        ((bytes[at + 1] ?? 0) << 16) |
        ((bytes[at + 2] ?? 0) << 8) |
        (bytes[at + 3] ?? 0);
      total = (total + (word >>> 0)) >>> 0;
    }
    return total;
  };
  const table = (name: string) => {
    const entry = tables.get(name);
    if (!entry) throw new Error(`no ${name} table`);
    return entry;
  };
  const glyphOf = (codePoint: number): number => {
    const cmap = table('cmap').offset;
    const sub = cmap + view.getUint32(cmap + 8);
    const segCount = view.getUint16(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + segCount * 2 + 2;
    const deltas = starts + segCount * 2;
    for (let index = 0; index < segCount; index += 1) {
      const start = view.getUint16(starts + index * 2);
      const end = view.getUint16(ends + index * 2);
      if (codePoint >= start && codePoint <= end) {
        return (codePoint + view.getInt16(deltas + index * 2)) & 0xffff;
      }
    }
    return 0;
  };
  const advanceOf = (glyph: number) => view.getUint16(table('hmtx').offset + glyph * 4);
  return {
    sfnt: tag(0),
    tables,
    sum,
    whole: () => sum(0, bytes.length),
    glyphOf,
    advanceOf,
    ascender: view.getInt16(table('hhea').offset + 4),
    descender: view.getInt16(table('hhea').offset + 6),
  };
}

describe('the standard faces', () => {
  it.skipIf(!existsSync(FONT_DATA))('are what the fork font data gives', () => {
    // Throws (exit 1) when a generated file differs from what the data gives now.
    execFileSync(process.execPath, [
      resolve(HERE, '../scripts/generate-standard-fonts.mjs'),
      '--check',
    ]);
  });

  it('lay text out with the built-in faces numbers', () => {
    const helvetica = standardFontMetrics('helvetica');
    // The engine puts a 10 pt line's baseline in an 18 pt plate at
    // 9 − (9.45 − 2.24) / 2 + 1 = 6.395: that is this ascent and descent.
    expect([helvetica.ascent, helvetica.descent]).toEqual([945, -224]);
    expect(['A', 'a', ' ', 'W'].map((char) => helvetica.advance(char.codePointAt(0)!))).toEqual([
      667, 556, 278, 944,
    ]);
    // WinAnsi can't write it: the engine draws it with another font.
    expect(helvetica.advance('Ж'.codePointAt(0)!)).toBeNull();
    // A fixed-pitch face advances 600 for every character it writes.
    const courier = standardFontMetrics('courier-bold');
    expect(
      new Set(['i', 'W', '€', ' '].map((char) => courier.advance(char.codePointAt(0)!))),
    ).toEqual(new Set([600]));
  });

  it.each(STANDARD_FONTS)('%s is an OpenType font with the engine advances', async (font) => {
    const program = standardFontProgram(font);
    const bytes = await program.load();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(program.hash);
    expect(await program.load()).toBe(bytes);

    const otf = readOpenType(bytes);
    expect(otf.sfnt).toBe('OTTO');
    expect([...otf.tables.keys()]).toEqual([
      'CFF ',
      'OS/2',
      'cmap',
      'head',
      'hhea',
      'hmtx',
      'maxp',
      'name',
      'post',
    ]);
    for (const [name, entry] of otf.tables) {
      if (name === 'head') continue;
      expect(otf.sum(entry.offset, entry.length), name).toBe(entry.checksum);
    }
    expect(otf.whole()).toBe(0xb1b0afba);

    const metrics = standardFontMetrics(font);
    expect([otf.ascender, otf.descender]).toEqual([metrics.ascent, metrics.descent]);
    // Every character the engine writes reaches a glyph with the engine's advance.
    const sample = font === 'symbol' ? 'αβ∑' : font === 'zapf-dingbats' ? '✁✂' : 'Hég€';
    for (const char of sample) {
      const glyph = otf.glyphOf(char.codePointAt(0)!);
      expect(glyph, char).toBeGreaterThan(0);
      if (font !== 'zapf-dingbats') {
        expect(otf.advanceOf(glyph), char).toBe(metrics.advance(char.codePointAt(0)!));
      }
    }
  });

  it('name each program by its hash in CSS, with a stack for before it loads', () => {
    const css = standardFontCss('times-bold-italic');
    expect(css.fontFamily).toBe(
      `"epdf-${standardFontProgram('times-bold-italic').hash.slice(0, 16)}", "Times New Roman", Times, serif`,
    );
    expect([css.fontWeight, css.fontStyle]).toEqual([700, 'italic']);
  });
});

describe('the last-resort program', () => {
  it('has the numbers the engine lays its boxes out with', () => {
    const font = readOpenType(lastResortFontBytes());
    expect(font.advanceOf(1)).toBe(LAST_RESORT_METRICS.advance);
    expect(font.ascender).toBe(LAST_RESORT_METRICS.ascent);
    expect(font.descender).toBe(LAST_RESORT_METRICS.descent);
  });
});
