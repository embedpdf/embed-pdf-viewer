/**
 * The feature names are API: an app's `disable` list holds them. All features and Turn features
 * off list them; these tests hold both pages to the tree `disable` and `readOnly` read
 * (`FEATURE_PARTS`, `READ_ONLY_FEATURES`), so a feature, a part or what `readOnly` turns off
 * can't change in one place only.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FEATURE_PARTS, READ_ONLY_FEATURES } from '../../../chrome/src/features';

const pages = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/content/viewer/features',
);

/** The rows of the Markdown table whose header row starts with `header`, as trimmed cells. */
function tableRows(file: string, header: string): string[][] {
  const lines = readFileSync(resolve(pages, file), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith(`| ${header} |`));
  if (start < 0) throw new Error(`${file}: no table headed "${header}"`);
  const rows: string[][] = [];
  // Past the header and its divider, to the first line that isn't a row.
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

/** The names in backticks in a cell: `` `annotations` ``, `` `.highlight` ``. */
const namesIn = (cell: string): string[] =>
  [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);

const TREE = FEATURE_PARTS as Readonly<Record<string, readonly string[]>>;

describe('All features', () => {
  it('lists every feature of the tree, once, and nothing else', () => {
    const listed = tableRows('index.mdx', 'Feature').map((row) => namesIn(row[0]!)[0]);
    expect([...listed].sort()).toEqual(Object.keys(TREE).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('Turn features off', () => {
  const rows = tableRows('turning-off.mdx', 'Feature').map(([features, parts, readOnly]) => ({
    features: namesIn(features!),
    parts: namesIn(parts!),
    readOnly: readOnly!,
  }));

  it('lists every feature of the tree, once, and nothing else', () => {
    const listed = rows.flatMap((row) => row.features);
    expect([...listed].sort()).toEqual(Object.keys(TREE).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("names each feature's parts as the tree has them", () => {
    for (const row of rows) {
      for (const feature of row.features) {
        expect(row.parts, feature).toEqual(TREE[feature]!.map((part) => `.${part}`));
      }
    }
  });

  it('says what readOnly turns off as readOnly does', () => {
    /** What the page's cell says goes: the whole feature, some of its parts, or nothing. */
    const offPerPage = (feature: string, cell: string): string[] => {
      if (cell === 'no') return [];
      if (['all', 'yes', 'both'].includes(cell)) return [feature];
      // `.writing` only, maybe with why after a comma.
      if (/^`[^`]+` only\b/.test(cell)) return namesIn(cell).map((part) => `${feature}${part}`);
      throw new Error(`${feature}: "${cell}" says neither all, some or none`);
    };
    for (const row of rows) {
      for (const feature of row.features) {
        const off = READ_ONLY_FEATURES.filter(
          (name) => name === feature || name.startsWith(`${feature}.`),
        );
        expect(offPerPage(feature, row.readOnly), feature).toEqual(off);
      }
    }
  });
});
