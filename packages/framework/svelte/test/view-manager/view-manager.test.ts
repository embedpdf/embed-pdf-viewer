import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentValue } from '../../src/runtime';
import {
  useViewManager,
  useViewManagerEvent,
  useViewManagerState,
  viewManagerPlugin,
} from '../../src/view-manager';
import type { PaneInfo } from '../../src/view-manager';
import { bytesInput } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The view manager's readers against a real kernel: the panes as a reactive object that follows
 * a split, a selector, and an event that stops with its component. The view manager is a
 * workspace plugin, so its handle works before any document opens.
 */

const plugins = [viewManagerPlugin()];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useViewManagerState', () => {
  it('reads the panes and the focused one, and follows a split', async () => {
    let views: ReturnType<typeof useViewManager> | null = null;
    const panes = probe(
      () => {
        views = useViewManager();
        return useViewManagerState();
      },
      (state) => ({ panes: state.panes, focused: state.focusedPaneId }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [panes] });
    expect(latest(panes.seen)).toEqual({ panes: [], focused: null });

    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    flushSync();
    const before = latest(panes.seen) as { panes: readonly PaneInfo[] };
    expect(before.panes).toHaveLength(1);
    expect(before.panes[0]!.documentIds).toEqual(['a', 'b']);

    const paneId = views!.splitPane('b');
    flushSync();
    const after = latest(panes.seen) as { panes: readonly PaneInfo[]; focused: string | null };
    expect(after.panes.map((pane) => pane.documentIds)).toEqual([['a'], ['b']]);
    expect(after.focused).toBe(paneId);
  });

  it('with a selector, wakes only when the value it picks changes', async () => {
    const focused = probe(
      () => useViewManagerState((state) => state.focusedPaneId),
      (value: CurrentValue<string | null>) => value.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [focused] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const runs = focused.seen.length;

    // A second document joins the focused pane: the panes change, the focused pane doesn't.
    await kernel.documents.open(bytesInput('b'));
    flushSync();
    expect(focused.seen).toHaveLength(runs);
  });
});

describe('useViewManagerEvent', () => {
  it('subscribes once, and stops when the component goes away', async () => {
    const created = vi.fn();
    let views: ReturnType<typeof useViewManager> | null = null;
    const listener = probe(
      () => useViewManagerEvent((viewManager) => viewManager.onPaneCreated, created),
      () => 0,
    );
    const handle = probe(
      () => (views = useViewManager()),
      () => 0,
    );
    const control: { hide?: () => void } = {};
    const { kernel } = await viewerWith(plugins, Toggled, {
      probes: [listener],
      kept: [handle],
      control,
    });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    flushSync();
    // The first document opened into a new pane; the split adds one more.
    created.mockClear();
    const paneId = views!.splitPane('b');
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0]![0]).toEqual({ paneId });

    control.hide!();
    flushSync();
    views!.splitPane('a');
    expect(created).toHaveBeenCalledTimes(1);
  });
});
