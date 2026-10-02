import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { ActionsToken, actionsPlugin } from '../../src/actions';
import {
  MetadataToken,
  metadataPlugin,
  metadataState,
  useMetadata,
  useMetadataEvent,
  useMetadataState,
} from '../../src/metadata';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput } from '../fixtures/counter-plugin';
import { CUSTOM, METADATA, metadataEngine } from '../fixtures/metadata-engine';
import Probes from '../fixtures/Probes.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The metadata readers against a real kernel: the declared state as a reactive object (empty
 * without a document), a selector that wakes only when its value changes, the API before a
 * document opens, and the events.
 */

const plugins = [metadataPlugin(), actionsPlugin({ openSequence: 'off' })];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useMetadataState', () => {
  it("has exactly the page's State fields: empty with no document, the document's once it loads", async () => {
    const state = probe(
      () => useMetadataState(),
      (record) => ({ ...record }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] }, metadataEngine);
    expect(latest(state.seen)).toEqual(metadataState.empty);

    await kernel.documents.open(bytesInput('doc'));
    await kernel.capability(MetadataToken).refresh();
    flushSync();
    expect(latest(state.seen)).toEqual({ metadata: METADATA, custom: CUSTOM, status: 'ready' });
  });

  it('with a selector, gives { current } that wakes only when the value it picks changes', async () => {
    const titles = probe(
      () => useMetadataState((state) => state.metadata?.title ?? null),
      (title: CurrentValue<string | null>) => title.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [titles] }, metadataEngine);
    await kernel.documents.open(bytesInput('doc'));
    await kernel.capability(MetadataToken).refresh();
    flushSync();
    expect(latest(titles.seen)).toBe('Q2 Proposal');
    const runs = titles.seen.length;

    // Another plugin's change wakes every reader; the title is the same, so nothing runs again.
    kernel.settingsOf(ActionsToken).updateSettings({ policy: { uri: { hover: 'block' } } });
    flushSync();
    expect(titles.seen).toHaveLength(runs);
  });

  it('follows the document after it closes: empty again', async () => {
    const state = probe(
      () => useMetadataState(),
      (record) => ({ ...record }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] }, metadataEngine);
    await kernel.documents.open(bytesInput('doc'));
    await kernel.capability(MetadataToken).refresh();
    flushSync();
    expect(latest(state.seen)).toMatchObject({ status: 'ready' });

    await kernel.documents.close('doc');
    flushSync();
    expect(latest(state.seen)).toEqual(metadataState.empty);
  });
});

describe('useMetadata', () => {
  it('without a document, a call says no document is open; with one, the same handle reaches it', async () => {
    let metadata: ReturnType<typeof useMetadata> | null = null;
    const capture = probe(
      () => (metadata = useMetadata()),
      () => 0,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [capture] }, metadataEngine);
    expect(() => metadata!.canUpdate()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    // A namespace refuses too; a verb that returns a promise rejects, so `.catch()` sees it.
    await expect(metadata!.custom.update({})).rejects.toMatchObject({ code: 'not-ready' });

    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    expect(metadata!.canUpdate()).toBe(true);
  });
});

describe('useMetadataEvent', () => {
  it('hears the document once it is open, and stops when the component goes away', async () => {
    const titles: (string | null)[] = [];
    const listener = probe(
      () =>
        useMetadataEvent(
          (metadata) => metadata.onResynced,
          ({ metadata }) => titles.push(metadata.title),
        ),
      () => 0,
    );
    const control: { hide?: () => void } = {};
    const { kernel } = await viewerWith(
      plugins,
      Toggled,
      { probes: [listener], control },
      metadataEngine,
    );
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    // A load (here, a refresh) reports the fields it read.
    await kernel.capability(MetadataToken).refresh();
    expect(latest(titles)).toBe('Q2 Proposal');
    const heard = titles.length;

    control.hide!();
    flushSync();
    await kernel.capability(MetadataToken).refresh();
    expect(titles).toHaveLength(heard);
  });
});
