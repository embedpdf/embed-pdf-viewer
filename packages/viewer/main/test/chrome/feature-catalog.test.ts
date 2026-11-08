/**
 * The feature names are API: an app's `features` holds them. All features and Turn features on
 * and off list them; these tests hold both pages to the tree `features` and `readOnly` read
 * (`FEATURE_PARTS`, `START_OFF_FEATURES`, `READ_ONLY_FEATURES`), so a feature, a part, what starts
 * off or what `readOnly` turns off can't change in one place only.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FEATURE_PARTS,
  READ_ONLY_FEATURES,
  START_OFF_FEATURES,
} from '../../../chrome/src/features';

const pages = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/content/viewer/features',
);

const read = (file: string): string => readFileSync(resolve(pages, file), 'utf8');

/**
 * The Markdown tables whose header row starts with `header`, in the page's order: each its rows,
 * as trimmed cells.
 */
function tablesHeaded(file: string, header: string): string[][][] {
  const lines = read(file).split('\n');
  const tables = lines.flatMap((line, start) => {
    if (!line.startsWith(`| ${header} |`)) return [];
    const rows: string[][] = [];
    // Past the header and its divider, to the first line that isn't a row.
    for (const row of lines.slice(start + 2)) {
      if (!row.startsWith('|')) break;
      rows.push(
        row
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      );
    }
    return [rows];
  });
  if (tables.length === 0) throw new Error(`${file}: no table headed "${header}"`);
  return tables;
}

/** The names in backticks in a cell: `` `annotations` ``, `` `.highlight` ``. */
const namesIn = (cell: string): string[] =>
  [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);

const TREE = FEATURE_PARTS as Readonly<Record<string, readonly string[]>>;

/**
 * What an "On from the start" cell says starts off: nothing (`yes`), the whole feature (`no`), or
 * every part but the one it names (`` `.filling` only ``, or `Filling only`).
 */
function startsOffPerPage(feature: string, cell: string): string[] {
  if (cell === 'yes') return [];
  if (cell === 'no') return [feature];
  const only = /^`?\.?(\w+)`? only$/i.exec(cell)?.[1]?.toLowerCase();
  if (only === undefined) throw new Error(`${feature}: "${cell}" says neither yes, no or one part`);
  return TREE[feature]!.filter((part) => part !== only).map((part) => `${feature}.${part}`);
}

/** What starts off inside `feature`, as `START_OFF_FEATURES` has it. */
const startsOff = (feature: string): string[] =>
  START_OFF_FEATURES.filter((name) => name === feature || name.startsWith(`${feature}.`));

describe('All features', () => {
  const [rows] = tablesHeaded('index.mdx', 'Feature') as [string[][]];

  it('lists every feature of the tree, once, and nothing else', () => {
    const listed = rows.map((row) => namesIn(row[0]!)[0]);
    expect([...listed].sort()).toEqual(Object.keys(TREE).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('says what starts off as the defaults have it', () => {
    for (const [name, , onFromTheStart] of rows) {
      const feature = namesIn(name!)[0]!;
      expect(startsOffPerPage(feature, onFromTheStart!), feature).toEqual(startsOff(feature));
    }
  });
});

describe('Turn features on and off', () => {
  type Row = { feature: string; parts: string[]; readOnly: string | undefined };
  // Two tables: the features `readOnly` turns off, then the ones it keeps. A cell names the
  // feature's parts first; "`readOnly` turns off only …" after them says it turns off one part.
  const [changing, keeping] = tablesHeaded('turning-off.mdx', 'Feature').map((rows) =>
    rows.map(([name, covers]): Row => {
      const [parts, readOnly] = covers!.split('`readOnly`');
      return { feature: namesIn(name!)[0]!, parts: namesIn(parts!), readOnly };
    }),
  ) as [Row[], Row[]];
  const rows = [...changing, ...keeping];

  it('lists every feature of the tree, once, and nothing else', () => {
    const listed = rows.map((row) => row.feature);
    expect([...listed].sort()).toEqual(Object.keys(TREE).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("names each feature's parts as the tree has them", () => {
    for (const { feature, parts } of rows) {
      expect(parts, feature).toEqual(TREE[feature]!.map((part) => `.${part}`));
    }
  });

  it('says what starts off as the defaults have it', () => {
    // "All of them start on, except `forms.building`, … and `snapshots`."
    const except = /All of them start on, except ([\s\S]+?)\.\s/.exec(read('turning-off.mdx'));
    if (!except) throw new Error('turning-off.mdx: no "All of them start on, except …"');
    expect(namesIn(except[1]!).sort()).toEqual([...START_OFF_FEATURES].sort());
  });

  it('says what readOnly turns off as readOnly does', () => {
    /** What a row says `readOnly` turns off: the whole feature, or the one part it names. */
    const offPerPage = ({ feature, parts, readOnly }: Row): string[] => {
      if (readOnly === undefined) return [feature];
      // "turns off only this part", of a feature with one, or "turns off only `.signing`".
      const only = /^ turns off only (?:this part\b|`(\.\w+)`)/.exec(readOnly);
      if (!only || (!only[1] && parts.length !== 1)) {
        throw new Error(`${feature}: "${readOnly}" names no one part`);
      }
      return [`${feature}${only[1] ?? parts[0]}`];
    };
    const off = (feature: string): string[] =>
      READ_ONLY_FEATURES.filter((name) => name === feature || name.startsWith(`${feature}.`));
    for (const row of changing) expect(offPerPage(row), row.feature).toEqual(off(row.feature));
    for (const { feature } of keeping) expect(off(feature), feature).toEqual([]);
  });
});
