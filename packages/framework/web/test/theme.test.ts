import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EPDF_VARIABLES,
  epdfThemeVariables,
  mixAccent,
  paint,
  paintDefault,
  type EpdfTheme,
  type EpdfVariable,
  type EpdfVariableDefinition,
} from '../src/theme';

const definitions = Object.entries(EPDF_VARIABLES) as [EpdfVariable, EpdfVariableDefinition][];
const definitionOf = (name: string): EpdfVariableDefinition | undefined =>
  (EPDF_VARIABLES as Record<string, EpdfVariableDefinition>)[name];

// ── the theming page ──

/** The theming page, which promises every variable this table lists. */
const themingPage = readFileSync(
  new URL('../../../../docs/content/headless/ui/theming.mdx', import.meta.url),
  'utf8',
);

interface SettingRow {
  /** The owner of the settings, from the table's heading: `viewer`, `annotation`, … */
  owner: string;
  settingCell: string;
  defaultCell: string;
  fromCssCell: string;
}

interface CssOnlyRow {
  fromCssCell: string;
  defaultCell: string;
}

/** The rows of the page's "Every color" tables, split into setting rows and CSS-only rows. */
function everyColorRows(): { settingRows: SettingRow[]; cssOnlyRows: CssOnlyRow[] } {
  const start = themingPage.indexOf('## Every color');
  const end = themingPage.indexOf('## What isn', start);
  const settingRows: SettingRow[] = [];
  const cssOnlyRows: CssOnlyRow[] = [];
  let owner = '';
  for (const line of themingPage.slice(start, end).split('\n')) {
    if (line.startsWith('**')) {
      // "**The viewer**", or "**Search**: `searchPlugin({ highlight })`"
      owner = /(\w+)Plugin\(/.exec(line)?.[1] ?? (line.includes('The viewer') ? 'viewer' : '');
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === 'Setting' || cells[0] === 'From CSS' || cells[0].startsWith(':')) continue;
    if (cells[0].includes('--epdf-')) {
      cssOnlyRows.push({ fromCssCell: cells[0], defaultCell: cells[2] });
    } else {
      settingRows.push({
        owner,
        settingCell: cells[0],
        defaultCell: cells[2],
        fromCssCell: cells[3],
      });
    }
  }
  return { settingRows, cssOnlyRows };
}

const variableIn = (cell: string): string => /--epdf-([a-z0-9-]+)/.exec(cell)?.[1] ?? cell;
const { settingRows, cssOnlyRows } = everyColorRows();

// ── paint ──

describe('paint', () => {
  it('looks for a part that follows the annotation accent, then both accents, then the setting', () => {
    expect(paint('annotation-outline', '#3858e9')).toBe(
      'var(--epdf-annotation-outline, var(--epdf-annotation-accent, var(--epdf-accent, #3858e9)))',
    );
    expect(paint('annotation-accent', '#e91e63')).toBe(
      'var(--epdf-annotation-accent, var(--epdf-accent, #e91e63))',
    );
  });

  it("looks for a part that follows the viewer's accent, then --epdf-accent, then the setting", () => {
    expect(paint('text-selection-handle', '#e91e63')).toBe(
      'var(--epdf-text-selection-handle, var(--epdf-accent, #e91e63))',
    );
  });

  it("looks for a part that follows another part in that part's variable, then in what that part follows", () => {
    // The rotation handle looks like the other handles: their variables reach it too.
    expect(paint('annotation-rotation-handle-fill', '#ffffff')).toBe(
      'var(--epdf-annotation-rotation-handle-fill, var(--epdf-annotation-handle-fill, #ffffff))',
    );
    expect(paint('annotation-rotation-handle-stroke', '#3858e9')).toBe(
      'var(--epdf-annotation-rotation-handle-stroke, var(--epdf-annotation-handle-stroke, ' +
        'var(--epdf-annotation-accent, var(--epdf-accent, #3858e9))))',
    );
  });

  it('looks for a part with a color of its own only in its own variable', () => {
    expect(paint('search-highlight', '#ffd500')).toBe('var(--epdf-search-highlight, #ffd500)');
    expect(paint('accent', '#3858e9')).toBe('var(--epdf-accent, #3858e9)');
  });

  it('paints a number as it is, such as a width or an opacity', () => {
    expect(paint('annotation-guide-width', 1.5)).toBe('var(--epdf-annotation-guide-width, 1.5)');
    expect(paint('ghost-opacity', 0.3)).toBe('var(--epdf-ghost-opacity, 0.3)');
  });

  it('paints a dash style as a dash array, the value its variable holds', () => {
    expect(paint('annotation-outline-dash', 'dashed')).toBe(
      'var(--epdf-annotation-outline-dash, 4 3)',
    );
    expect(paint('annotation-guide-dash', 'solid')).toBe('var(--epdf-annotation-guide-dash, none)');
  });

  it('accepts only variables that override a setting', () => {
    // @ts-expect-error a part you style yourself has no setting
    expect(paint('scrollbar-thumb', '#000000')).toContain('--epdf-scrollbar-thumb');
  });
});

// ── translucent defaults ──

describe('mixAccent', () => {
  it('mixes the accent it follows, variables included, down to its percent', () => {
    expect(mixAccent('text-selection', '#3858e9')).toBe(
      'color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent)',
    );
    expect(mixAccent('annotation-marquee-fill', '#e91e63')).toBe(
      'color-mix(in srgb, var(--epdf-annotation-accent, var(--epdf-accent, #e91e63)) 8%, transparent)',
    );
  });

  it('leaves the accent variables to the mix, so a set accent never paints at full strength', () => {
    expect(paint('text-selection', mixAccent('text-selection', '#3858e9'))).toBe(
      'var(--epdf-text-selection, color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent))',
    );
    // A color set on the part itself is used as it is, unmixed.
    expect(paint('form-field-border', 'rgb(0 0 255 / 0.5)')).toBe(
      'var(--epdf-form-field-border, rgb(0 0 255 / 0.5))',
    );
  });
});

// ── parts you style yourself ──

describe('paintDefault', () => {
  it("falls back to a CSS-only part's built-in look", () => {
    expect(paintDefault('scrollbar-thumb')).toBe('var(--epdf-scrollbar-thumb, rgb(0 0 0 / 0.4))');
    expect(paintDefault('font-mono')).toBe('var(--epdf-font-mono, ui-monospace, monospace)');
  });

  it('accepts only parts without a setting', () => {
    // @ts-expect-error the accent is a setting: paint it with its value
    expect(paintDefault('accent')).toBe('var(--epdf-accent, #3858e9)');
  });
});

// ── the table ──

describe('EPDF_VARIABLES', () => {
  it('lists every variable the theming page names, and nothing else', () => {
    const onPage = new Set(
      [...themingPage.matchAll(/--epdf-([a-z0-9-]+)/g)].map((match) => match[1]),
    );
    expect([...onPage].sort()).toEqual(definitions.map(([name]) => name).sort());
  });

  it('gives each row of the page one variable, overriding the setting the row names', () => {
    const listed = [...settingRows, ...cssOnlyRows].map((row) => variableIn(row.fromCssCell));
    expect(listed).toHaveLength(new Set(listed).size);
    expect(listed.sort()).toEqual(definitions.map(([name]) => name).sort());

    for (const row of settingRows) {
      const path = /`([^`]+)`/.exec(row.settingCell)?.[1];
      const perTool = row.settingCell.startsWith("A tool's") ? 'tools[].' : '';
      const name = variableIn(row.fromCssCell);
      expect({ name, setting: definitionOf(name)?.setting }).toEqual({
        name,
        setting: `${row.owner}.${perTool}${path}`,
      });
    }
  });

  it('has the defaults the page gives', () => {
    for (const row of settingRows) {
      // Only a literal: "the viewer's `accent` at 35%" is checked with the accents below.
      const literal = /^`'([^']*)'`$|^`([\d.]+)`$/.exec(row.defaultCell);
      if (!literal) continue;
      const definition = definitionOf(variableIn(row.fromCssCell));
      const value = literal[1] ?? literal[2];
      expect(definition?.default).toBe(definition?.keywords?.[value] ?? value);
    }
    for (const row of cssOnlyRows) {
      expect(definitionOf(variableIn(row.fromCssCell))?.default).toBe(
        /^`(.*)`$/.exec(row.defaultCell)?.[1],
      );
    }
  });

  it('dashes the way the page shows', () => {
    const dashRows = settingRows.filter((row) => row.fromCssCell.includes('-dash'));
    expect(dashRows).toHaveLength(2);
    for (const row of dashRows) {
      const shown = /\(`([^`]+)`\)/.exec(row.fromCssCell)?.[1];
      expect(definitionOf(variableIn(row.fromCssCell))?.keywords?.dashed).toBe(shown);
    }
  });

  it('follows the part the page gives as its default: another part, or an accent', () => {
    // A Default cell such as "`chrome.handles.fill`", "`chrome.accent` at 8%" or "the viewer's `accent`".
    const variableOfSetting = new Map(
      definitions.flatMap(([name, definition]) =>
        definition.setting ? [[definition.setting, name] as const] : [],
      ),
    );
    for (const row of settingRows) {
      const followed = /^(the viewer's )?`([a-zA-Z.]+)`(?: at \d+%)?$/.exec(row.defaultCell);
      const owner = followed?.[1] ? 'viewer' : row.owner;
      const name = variableIn(row.fromCssCell);
      expect({ name, follows: definitionOf(name)?.follows }).toEqual({
        name,
        follows: followed ? variableOfSetting.get(`${owner}.${followed[2]}`) : undefined,
      });
    }
  });

  it("gives a part that follows another that part's default, mixed when it is translucent", () => {
    for (const [name, definition] of definitions) {
      if (!definition.follows) {
        expect(definition.accentPercent, name).toBeUndefined();
        continue;
      }
      const followed = EPDF_VARIABLES[definition.follows];
      expect(followed.setting, name).toBeDefined();
      expect(definition.default, name).toBe(
        definition.accentPercent === undefined
          ? followed.default
          : `color-mix(in srgb, ${followed.default} ${definition.accentPercent}%, transparent)`,
      );
    }
  });

  it('never gives one setting two variables', () => {
    const settings = definitions.flatMap(([, definition]) => definition.setting ?? []);
    expect(settings).toHaveLength(new Set(settings).size);
  });
});

// ── a theme as setting names ──

describe('epdfThemeVariables', () => {
  it('turns setting names into the variables that override them', () => {
    expect(
      epdfThemeVariables({
        accent: '#e91e63',
        page: { shadow: 'none' },
        search: { highlight: { color: '#7dd3fc' } },
        annotation: {
          chrome: { outline: { style: 'dashed', width: 2 } },
          tools: { ghost: { opacity: 0.3 } },
        },
      }),
    ).toEqual({
      '--epdf-accent': '#e91e63',
      '--epdf-page-shadow': 'none',
      '--epdf-annotation-outline-width': '2',
      '--epdf-annotation-outline-dash': '4 3',
      '--epdf-ghost-opacity': '0.3',
      '--epdf-search-highlight': '#7dd3fc',
    });
    expect(epdfThemeVariables({})).toEqual({});
  });

  it('reaches every variable that overrides a setting', () => {
    const settingVariables = definitions.filter(([, definition]) => definition.setting);
    for (const [name, definition] of settingVariables) {
      const path = definition
        .setting!.replace(/^viewer\./, '')
        .replace('[]', '')
        .split('.');
      const theme = path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), 'x');
      expect(Object.keys(epdfThemeVariables(theme as EpdfTheme)), name).toEqual([`--epdf-${name}`]);
    }
  });
});
