import { describe, expect, it, vi } from 'vitest';

import { createCapabilityToken, definePlugin } from '../src/index';
import { createKernel } from '../src/kernel';
import {
  createSettingsStore,
  mergeSettings,
  type DeepPartial,
  type SettingsApi,
} from '../src/settings';
import { VIEWER_DEFAULTS, viewerSettingsOf } from '../src/viewer-settings';
import type { AnyPlugin } from '../src/types';
import { bytesInput, immediateEngine } from './helpers';

/**
 * A plugin's settings: what the app registered over the plugin's defaults, declared in the
 * plugin's definition, one store per plugin registration built when the kernel plans the
 * plugin list, shared by every document the plugin is open in and there before the first one.
 */

interface SearchSettings {
  readonly reveal: boolean;
  readonly highlight: { readonly color: string; readonly activeColor: string };
  readonly tags: readonly string[];
  readonly limit: number | null;
}

const DEFAULTS: SearchSettings = {
  reveal: true,
  highlight: { color: 'yellow', activeColor: 'orange' },
  tags: ['text'],
  limit: null,
};

/** A store's calls, as one instance sees them, with no instance lifetime to end. */
function storeWith(registered?: DeepPartial<SearchSettings>, wake: () => void = () => {}) {
  const store = createSettingsStore({ defaults: DEFAULTS, registered }, wake, (error) => {
    throw error;
  });
  return store.forInstance(() => {}).api;
}

describe('merging', () => {
  it('merges plain objects key by key, so a nested change keeps its siblings', () => {
    const settings = storeWith();
    settings.updateSettings({ highlight: { color: 'red' } });
    expect(settings.getSettings().highlight).toEqual({ color: 'red', activeColor: 'orange' });
  });

  it('replaces arrays and other values whole', () => {
    const settings = storeWith();
    settings.updateSettings({ tags: ['annotations'], limit: 20, reveal: false });
    expect(settings.getSettings()).toMatchObject({
      tags: ['annotations'],
      limit: 20,
      reveal: false,
    });
    settings.updateSettings({ limit: null });
    expect(settings.getSettings().limit).toBeNull(); // null is a value, not a gap
  });

  it('ignores undefined, at any depth', () => {
    const settings = storeWith();
    const before = settings.getSettings();
    settings.updateSettings({ reveal: undefined, highlight: { color: undefined } });
    expect(settings.getSettings()).toBe(before);
  });

  it('keeps the object of everything a change leaves as it was', () => {
    const settings = storeWith();
    const before = settings.getSettings();
    settings.updateSettings({ reveal: false });
    expect(settings.getSettings()).not.toBe(before);
    expect(settings.getSettings().highlight).toBe(before.highlight);
    expect(settings.getSettings().tags).toBe(before.tags);
  });

  it('merges what the app registered over the defaults by the same rules', () => {
    const settings = storeWith({ highlight: { activeColor: 'blue' }, tags: [] });
    expect(settings.getSettings()).toEqual({
      reveal: true,
      highlight: { color: 'yellow', activeColor: 'blue' },
      tags: [],
      limit: null,
    });
  });
});

describe('whole settings', () => {
  it('replaces a whole setting instead of merging into it, and keeps it when it is equal', () => {
    const store = createSettingsStore(
      { defaults: DEFAULTS, registered: { highlight: { color: 'red' } }, whole: ['highlight'] },
      () => {},
      (error) => {
        throw error;
      },
    );
    const settings = store.forInstance(() => {}).api;
    // What the app registered replaces the default whole too.
    expect(settings.getSettings().highlight).toEqual({ color: 'red' });
    settings.updateSettings({ highlight: { activeColor: 'blue' }, reveal: false });
    expect(settings.getSettings()).toMatchObject({
      highlight: { activeColor: 'blue' },
      reveal: false,
    });
    const before = settings.getSettings();
    settings.updateSettings({ highlight: { activeColor: 'blue' } });
    expect(settings.getSettings()).toBe(before);
  });
});

describe('mergeSettings', () => {
  it('merges the way a store does, for changes kept before a store exists', () => {
    const merged = mergeSettings(DEFAULTS, { highlight: { color: 'red' }, tags: ['x'] });
    expect(merged).toEqual({
      ...DEFAULTS,
      highlight: { ...DEFAULTS.highlight, color: 'red' },
      tags: ['x'],
    });
    // What the change leaves alone keeps its object.
    expect(mergeSettings(DEFAULTS, { reveal: undefined })).toBe(DEFAULTS);
    expect(mergeSettings(DEFAULTS, undefined)).toBe(DEFAULTS);
  });

  it('replaces the whole settings instead of merging into them', () => {
    const merged = mergeSettings(DEFAULTS, { highlight: { activeColor: 'blue' } }, ['highlight']);
    expect(merged.highlight).toEqual({ activeColor: 'blue' });
  });
});

describe('viewerSettingsOf', () => {
  it('gives every setting left out its default', () => {
    expect(viewerSettingsOf({})).toEqual(VIEWER_DEFAULTS);
  });

  it('takes what is given, and fills in the page side left out', () => {
    const identity = { userId: 'ada', displayName: 'Ada' };
    expect(
      viewerSettingsOf({
        identity,
        scope: ['annotations:read'],
        accent: '#ff0000',
        page: { shadow: 'none' },
      }),
    ).toEqual({
      identity,
      scope: ['annotations:read'],
      accent: '#ff0000',
      page: { background: VIEWER_DEFAULTS.page.background, shadow: 'none' },
    });
  });
});

describe('reset', () => {
  it('goes back to what the app registered, not to the defaults', () => {
    const settings = storeWith({ highlight: { color: 'green' } });
    settings.updateSettings({ highlight: { color: 'red' }, reveal: false });
    settings.resetSettings();
    expect(settings.getSettings()).toEqual({
      ...DEFAULTS,
      highlight: { ...DEFAULTS.highlight, color: 'green' },
    });
  });
});

describe('onSettingsChanged', () => {
  it('fires once per call that changed something, naming the settings that changed', () => {
    const settings = storeWith();
    const listener = vi.fn();
    settings.onSettingsChanged(listener);

    settings.updateSettings({ reveal: false, highlight: { color: 'red' }, limit: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      settings: settings.getSettings(),
      changed: ['reveal', 'highlight'], // `limit` was already null
    });

    settings.updateSettings({ reveal: false, tags: ['text'] }); // equal values: nothing changed
    settings.updateSettings({});
    expect(listener).toHaveBeenCalledTimes(1);

    settings.resetSettings();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({
      settings: DEFAULTS,
      changed: ['reveal', 'highlight'],
    });
    settings.resetSettings(); // already what was registered
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when a reset finds the registered values already back', () => {
    const settings = storeWith();
    const listener = vi.fn();
    settings.updateSettings({ reveal: false });
    settings.updateSettings({ reveal: true });
    settings.onSettingsChanged(listener);
    settings.resetSettings();
    expect(listener).not.toHaveBeenCalled();
  });

  it('wakes readers before the event fires, and only for a change', () => {
    const order: string[] = [];
    const settings = storeWith(undefined, () => order.push('wake'));
    settings.onSettingsChanged(() => order.push('event'));
    settings.updateSettings({ reveal: false });
    settings.updateSettings({ reveal: false });
    expect(order).toEqual(['wake', 'event']);
  });
});

// ── through the kernel ──

type SearchApi = SettingsApi<SearchSettings> & {
  /** What the plugin's own code reads. */
  readSettings(): SearchSettings;
};
const SearchToken = createCapabilityToken<SearchApi>('search');

/** How a plugin declares its settings: next to its state, with the factory's config. */
const searchPlugin = (registered?: DeepPartial<SearchSettings>) =>
  definePlugin({
    id: 'search',
    scope: 'document',
    token: SearchToken,
    settings: { defaults: DEFAULTS, registered },
    create: (ctx) => {
      const settings = ctx.settings();
      return { api: { ...settings.api, readSettings: settings.get } };
    },
  });

async function kernelWith(plugin: AnyPlugin, ids: string[]) {
  const kernel = createKernel({ engine: immediateEngine(), plugins: [plugin] });
  await kernel.start();
  for (const id of ids) await kernel.documents.open(bytesInput(id));
  return kernel;
}

describe('settings in the kernel', () => {
  it('is one store per registration: a change through one document reaches every document', async () => {
    const kernel = await kernelWith(searchPlugin({ highlight: { color: 'green' } }), ['a', 'b']);
    const inA = kernel.capability(SearchToken, 'a');
    const inB = kernel.capability(SearchToken, 'b');
    expect(inB.getSettings().highlight.color).toBe('green');

    inA.updateSettings({ highlight: { color: 'red' } });
    expect(inB.getSettings()).toBe(inA.getSettings());
    expect(inB.readSettings().highlight).toEqual({ color: 'red', activeColor: 'orange' });

    await kernel.documents.open(bytesInput('c')); // opened later: the same settings
    expect(kernel.capability(SearchToken, 'c').getSettings()).toBe(inA.getSettings());

    inB.resetSettings(); // back to what was registered, for every document
    expect(inA.getSettings().highlight.color).toBe('green');
    await kernel.destroy();
  });

  it('wakes every reader, so selectors over getSettings() read again', async () => {
    const kernel = await kernelWith(searchPlugin(), ['a', 'b']);
    const reader = vi.fn(() => kernel.capability(SearchToken, 'b').getSettings().reveal);
    const unsubscribe = kernel.subscribe(reader);

    kernel.capability(SearchToken, 'a').updateSettings({ reveal: false });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader).toHaveLastReturnedWith(false);

    kernel.capability(SearchToken, 'a').updateSettings({ reveal: false }); // no change, no wake
    expect(reader).toHaveBeenCalledTimes(1);
    unsubscribe();
    await kernel.destroy();
  });

  it('fires the event in every document once per change, and a closing document ends its listeners', async () => {
    const kernel = await kernelWith(searchPlugin(), ['a', 'b']);
    const inA = vi.fn();
    const inB = vi.fn();
    kernel.capability(SearchToken, 'a').onSettingsChanged(inA);
    kernel.capability(SearchToken, 'b').onSettingsChanged(inB);

    kernel.capability(SearchToken, 'b').updateSettings({ limit: 5 });
    expect(inA).toHaveBeenCalledTimes(1);
    expect(inA).toHaveBeenCalledWith({
      settings: kernel.capability(SearchToken, 'b').getSettings(),
      changed: ['limit'],
    });
    expect(inB).toHaveBeenCalledTimes(1);

    await kernel.documents.close('a');
    kernel.capability(SearchToken, 'b').updateSettings({ limit: 6 });
    expect(inA).toHaveBeenCalledTimes(1); // a's listener went with a
    expect(inB).toHaveBeenCalledTimes(2);
    await kernel.destroy();
  });

  it('keeps the settings when every document closed, for the next one', async () => {
    const kernel = await kernelWith(searchPlugin(), ['a']);
    kernel.capability(SearchToken, 'a').updateSettings({ tags: ['forms'] });
    await kernel.documents.close('a');
    await kernel.documents.open(bytesInput('b'));
    expect(kernel.capability(SearchToken, 'b').getSettings().tags).toEqual(['forms']);
    await kernel.destroy();
  });

  it('exists before the first document: read and changed through the kernel, seen by the documents', async () => {
    const kernel = createKernel({
      engine: immediateEngine(),
      plugins: [searchPlugin({ highlight: { color: 'green' } })],
    });
    await kernel.start();
    const settings = kernel.settingsOf(SearchToken);
    expect(settings.getSettings().highlight).toEqual({ color: 'green', activeColor: 'orange' });

    const changes = vi.fn();
    settings.onSettingsChanged(changes);
    settings.updateSettings({ tags: ['forms'] }); // no document is open yet
    expect(changes).toHaveBeenCalledWith({ settings: settings.getSettings(), changed: ['tags'] });

    await kernel.documents.open(bytesInput('a'));
    const inA = kernel.capability(SearchToken, 'a');
    expect(inA.getSettings()).toBe(settings.getSettings());
    inA.updateSettings({ limit: 3 }); // and a document's change reaches the kernel's read
    expect(settings.getSettings().limit).toBe(3);
    expect(changes).toHaveBeenCalledTimes(2);
    await kernel.destroy();
  });

  it('throws the setup mistake: a token no plugin provides, a plugin with no settings', async () => {
    const PlainToken = createCapabilityToken<{ ping(): string }>('plain');
    const plainPlugin = definePlugin({
      id: 'plain',
      token: PlainToken,
      create: () => ({ api: { ping: () => 'pong' } }),
    });
    const kernel = createKernel({ engine: immediateEngine(), plugins: [plainPlugin] });
    expect(() => kernel.settingsOf(SearchToken)).toThrow('No capability "search"');
    expect(() => kernel.settingsOf(PlainToken)).toThrow('Plugin "plain" has no settings');
    await kernel.destroy();
  });

  it('refuses ctx.settings() in a plugin whose definition declares none', async () => {
    const ProbeToken = createCapabilityToken<{ read(): unknown }>('probe');
    const probe = definePlugin({
      id: 'probe',
      token: ProbeToken,
      create: (ctx) => ({ api: { read: () => ctx.settings().get() } }),
    });
    const kernel = createKernel({ engine: immediateEngine(), plugins: [probe] });
    expect(() => kernel.capability(ProbeToken).read()).toThrow('declares no settings');
    await kernel.destroy();
  });

  it('gives two kernels sharing one plugin definition a store each', async () => {
    const plugin = searchPlugin();
    const first = await kernelWith(plugin, ['a']);
    const second = await kernelWith(plugin, ['a']);
    first.capability(SearchToken, 'a').updateSettings({ reveal: false });
    expect(second.capability(SearchToken, 'a').getSettings().reveal).toBe(true);
    await first.destroy();
    await second.destroy();
  });
});
