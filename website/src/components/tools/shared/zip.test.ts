import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { crc32, uniqueName, zip } from './zip';

const text = (value: string) => new TextEncoder().encode(value);

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(text('hello'))).toBe(0x3610a686);
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('uniqueName', () => {
  it('keeps a free name, and numbers a taken one before its extension', () => {
    expect(uniqueName('data.xml', new Set())).toBe('data.xml');
    expect(uniqueName('data.xml', new Set(['DATA.xml']))).toBe('data (2).xml');
    expect(uniqueName('data.xml', new Set(['data.xml', 'data (2).xml']))).toBe('data (3).xml');
    expect(uniqueName('README', new Set(['README']))).toBe('README (2)');
  });
});

describe('zip', () => {
  it('writes a file unzip reads back, names and bytes intact', () => {
    const archive = zip([
      { name: 'figures.xlsx', bytes: text('spreadsheet') },
      { name: 'figures.xlsx', bytes: text('another one') },
      { name: 'Überweisung.xml', bytes: text('<x/>') },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'tools-zip-'));
    try {
      const path = join(dir, 'files.zip');
      writeFileSync(path, archive);
      // macOS's unzip lists UTF-8 names wrongly, so Python's zipfile reads the names.
      const names = execFileSync(
        'python3',
        [
          '-c',
          'import sys, zipfile; print("|".join(zipfile.ZipFile(sys.argv[1]).namelist()))',
          path,
        ],
        { encoding: 'utf8' },
      ).trim();
      expect(names).toBe('figures.xlsx|figures (2).xlsx|Überweisung.xml');
      expect(execFileSync('unzip', ['-t', path], { encoding: 'utf8' })).toContain('No errors');
      expect(execFileSync('unzip', ['-p', path, 'figures (2).xlsx'], { encoding: 'utf8' })).toBe(
        'another one',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
