/**
 * The `plugins` config: a built-in plugin's settings by its name, a plugin of your own as its
 * definition, and warnings for the rest; and how the app's settings meet what the viewer sets
 * itself (each only takes away).
 */
import { describe, expect, it } from 'vitest';

import { quickStampAssetIdOf } from '../../../chrome/src/config/default-stamps';
import { bothAllow } from '../../../chrome/src/features';
import {
  isPluginDefinition,
  readPluginsConfig,
  settingsOver,
} from '../../../chrome/src/plugin-settings';
import type { ViewerConfig } from '../../src/local/config';

const analyticsPlugin = () => ({
  id: 'acme-analytics',
  token: { name: 'acme-analytics' },
  create: () => ({ api: { track: () => {} } }),
});

describe('readPluginsConfig', () => {
  it('reads nothing from no config', () => {
    expect(readPluginsConfig(undefined)).toEqual({
      settings: {},
      viewer: { stamp: {}, signature: {} },
      own: [],
      problems: [],
    });
  });

  it("takes the viewer's own stamp and signature settings out of the plugins'", () => {
    const assetEngine = () => Promise.reject(new Error('unused'));
    const key = () => Promise.reject(new Error('unused'));
    const fonts = [{ key: 'great-vibes', url: '/fonts/GreatVibes.ttf', label: 'Great Vibes' }];
    const read = readPluginsConfig({
      stamp: { standard: false, quick: ['standard:Approved'], assetEngine, previewWidth: 128 },
      signature: { kinds: ['signature'], fonts, key, mode: 'ask' },
    });
    expect(read.viewer).toEqual({
      stamp: { standard: false, quick: ['standard:Approved'] },
      signature: { kinds: ['signature'], fonts },
    });
    // What each plugin's factory gets: its own settings, and nothing of the viewer's.
    expect(read.settings.stamp).toEqual({ assetEngine, previewWidth: 128 });
    expect(read.settings.signature).toEqual({ key, mode: 'ask' });
    expect(read.problems).toEqual([]);
  });

  it("takes a built-in plugin's settings by its name", () => {
    const stage = { spread: 'odd', zoom: { mode: 'fit-width' } } as const;
    const read = readPluginsConfig({ stage, search: { highlight: { color: '#a7f3d0' } } });
    expect(read.settings.stage).toBe(stage);
    expect(read.settings.search).toEqual({ highlight: { color: '#a7f3d0' } });
    expect(read.problems).toEqual([]);
  });

  it('takes a plugin definition under a name of its own as a plugin of your own', () => {
    const plugin = analyticsPlugin();
    const read = readPluginsConfig({ analytics: plugin });
    expect(read.own).toEqual([{ name: 'analytics', plugin }]);
    expect(read.settings).toEqual({});
  });

  it('leaves out a misspelled name, with the closest plugin', () => {
    expect(readPluginsConfig({ serch: { highlight: {} } }).problems).toEqual([
      '"serch" is not one of the viewer\'s plugins, and not a plugin definition (did you mean "search"?)',
    ]);
  });

  it('leaves out a plugin definition under a built-in name', () => {
    const read = readPluginsConfig({ search: analyticsPlugin() as never });
    expect(read.own).toEqual([]);
    expect(read.settings).toEqual({});
    expect(read.problems).toEqual([
      '"search" is the viewer\'s own search plugin: give it settings, or give your plugin a name of its own',
    ]);
  });

  it('leaves out settings for a plugin that takes none, and settings that are no object', () => {
    const read = readPluginsConfig({
      link: {},
      stage: 'odd',
    } as unknown as ViewerConfig['plugins']);
    expect(read.settings).toEqual({});
    expect(read.problems).toEqual([
      'the link plugin takes no settings',
      "the stage plugin's settings are an object",
    ]);
  });
});

describe('quickStampAssetIdOf', () => {
  it('names the standard stamps standard, and every other library by its id', () => {
    expect(quickStampAssetIdOf('standard:Approved')).toBe('embedpdf-standard:Approved');
    expect(quickStampAssetIdOf('embedpdf-custom:#abc')).toBe('embedpdf-custom:#abc');
  });
});

describe('isPluginDefinition', () => {
  it('knows a definition by its id and create', () => {
    expect(isPluginDefinition(analyticsPlugin())).toBe(true);
    expect(isPluginDefinition({ id: 'x' })).toBe(false);
    expect(isPluginDefinition({ spread: 'odd' })).toBe(false);
    expect(isPluginDefinition(null)).toBe(false);
  });
});

describe('settingsOver', () => {
  it("merges the app's settings over the viewer's, key by key", () => {
    expect(
      settingsOver<Record<string, unknown>>(
        { layout: 'vertical', zoom: { mode: 'automatic', min: 0.1 } },
        { spread: 'odd', zoom: { mode: 'fit-width' } },
      ),
    ).toEqual({ layout: 'vertical', spread: 'odd', zoom: { mode: 'fit-width', min: 0.1 } });
  });

  it("keeps the viewer's settings without the app's", () => {
    const viewer = { javascript: { enabled: true } };
    expect(settingsOver(viewer, undefined)).toBe(viewer);
  });
});

describe('bothAllow', () => {
  it('keeps what both allow, so each only takes away', () => {
    expect(bothAllow(true, true)).toBe(true);
    expect(bothAllow(true, ['ink'])).toEqual(['ink']);
    expect(bothAllow(['ink', 'square'], true)).toEqual(['ink', 'square']);
    expect(bothAllow(false, ['ink'])).toBe(false);
    expect(bothAllow(['ink'], false)).toBe(false);
    expect(bothAllow(['ink', 'square', 'highlight'], ['highlight', 'ink'])).toEqual([
      'ink',
      'highlight',
    ]);
  });
});

// Type tests: `pnpm typecheck` fails if a shape below stops being refused (or accepted).
export const pluginsConfigs: ViewerConfig[] = [
  {
    plugins: {
      stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
      selection: { color: 'rgb(124 58 237 / 0.3)' },
      actions: { javascript: { enabled: false } },
      annotation: { tools: [{ id: 'highlight', defaults: { color: '#fde047' } }], editable: false },
      form: { validation: 'none', fillable: ['text'] },
      analytics: analyticsPlugin(),
    },
  },
  // The viewer's own settings next to a plugin's, as Annotations and Forms & signatures write them.
  {
    plugins: {
      stamp: {
        standard: 'https://files.example.com/stamps/{locale}.pdf',
        quick: ['standard:Approved', 'standard:Rejected'],
      },
      signature: {
        mode: 'ask',
        allowCertify: true,
        kinds: ['signature'],
        fonts: [{ key: 'great-vibes', url: '/fonts/GreatVibes.ttf', label: 'Great Vibes' }],
      },
    },
  },
  { plugins: { stamp: { standard: false } } },
  // @ts-expect-error -- the stamps are `plugins.stamp`
  { stamps: { defaultLibrary: false } },
  // @ts-expect-error -- a kind of mark the viewer doesn't keep
  { plugins: { signature: { kinds: ['stamp'] } } },
  // @ts-expect-error -- a setting the stage plugin doesn't have
  { plugins: { stage: { spred: 'odd' } } },
  // @ts-expect-error -- the link plugin takes no settings
  { plugins: { link: { color: 'red' } } },
  // @ts-expect-error -- a value of the wrong type
  { plugins: { form: { fillable: 'text' } } },
];
