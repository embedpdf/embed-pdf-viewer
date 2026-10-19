import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { PluginError, createCapabilityToken, isPluginError } from '@embedpdf/core';
import type { AnyPlugin } from '@embedpdf/core';
import { useCapability, useSelector } from '../../src/runtime';
import { CounterToken, bytesInput, counterPlugin } from '../fixtures/counter-plugin';
import type { CounterCapability } from '../fixtures/counter-plugin';
import Guarded from '../fixtures/Guarded.svelte';
import HandleProbe from '../fixtures/HandleProbe.svelte';
import Probes from '../fixtures/Probes.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `useCapability` gives a handle that is always the capability of the document in scope. Without
 * one, a document plugin's calls refuse with `not-ready` (a method that returns a promise
 * rejects); a workspace plugin always resolves; a
 * token no plugin provides, and the strict `useSelector`, throw the kernel's reason. A read in a
 * reaction follows the kernel; a verb subscribes to nothing.
 */

const WorkspaceToken = createCapabilityToken<{ ping(): string }>('workspace-probe');
const workspacePlugin: AnyPlugin = {
  id: 'workspace-probe',
  token: WorkspaceToken,
  create: () => ({ api: { ping: () => 'pong' } }),
};
const plugins = [counterPlugin, workspacePlugin];

const refusal = (call: () => unknown): unknown => {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
};

/** Mount a viewer whose one probe creates a counter handle, and hand the handle back. */
async function counterHandle(extra: AnyPlugin[] = []) {
  let handle: CounterCapability | null = null;
  const probe = { read: () => (handle = useCapability(CounterToken)), pick: () => 0, seen: [] };
  const { kernel } = await viewerWith([...plugins, ...extra], Probes, { probes: [probe] });
  return { kernel, counter: handle as unknown as CounterCapability };
}

describe('useCapability without a document', () => {
  it('refuses with not-ready, reaches the capability once a document is ready, and refuses after it closes', async () => {
    const { kernel, counter } = await counterHandle();

    const error = refusal(() => counter.increment());
    expect(error).toBeInstanceOf(PluginError);
    expect(isPluginError(error, 'not-ready')).toBe(true);
    expect((error as PluginError).capability).toBe('counter');
    expect((error as PluginError).message).toBe('no document is open');
    // Namespaces refuse too.
    expect(
      isPluginError(
        refusal(() => counter.notes.add('note')),
        'not-ready',
      ),
    ).toBe(true);

    await kernel.documents.open(bytesInput('a'));
    counter.increment();
    expect(kernel.capability(CounterToken).getCount()).toBe(1);

    await kernel.documents.close('a');
    expect(
      isPluginError(
        refusal(() => counter.increment()),
        'not-ready',
      ),
    ).toBe(true);
  });

  it('rejects, rather than throws, from a method that returns a promise', async () => {
    const { kernel, counter } = await counterHandle();
    let saving: Promise<string> | null = null;
    expect(() => (saving = counter.save('draft'))).not.toThrow();
    await expect(saving).rejects.toMatchObject({ code: 'not-ready', capability: 'counter' });
    await expect(counter.notes.publish('note')).rejects.toMatchObject({ code: 'not-ready' });

    await kernel.documents.open(bytesInput('a'));
    await expect(counter.save('kept')).resolves.toBe('kept');
  });

  it('has stable members, and is no thenable', async () => {
    const { counter } = await counterHandle();
    expect(counter.increment).toBe(counter.increment);
    expect(counter.notes).toBe(counter.notes);
    expect(counter.notes.add).toBe(counter.notes.add);
    expect((counter as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(counter)).resolves.toBe(counter);
  });

  it('refuses the settings calls with not-ready for a plugin whose definition declares no settings', async () => {
    const PlainToken = createCapabilityToken<{ getSettings(): object }>('plain-probe');
    const plainPlugin: AnyPlugin = {
      id: 'plain-probe',
      token: PlainToken,
      scope: 'document',
      create: () => ({ api: { getSettings: () => ({}) } }),
    };
    let plain: { getSettings(): object } | null = null;
    const probe = { read: () => (plain = useCapability(PlainToken)), pick: () => 0, seen: [] };
    await viewerWith([...plugins, plainPlugin], Probes, { probes: [probe] });
    expect(
      isPluginError(
        refusal(() => plain!.getSettings()),
        'not-ready',
      ),
    ).toBe(true);
  });

  it('resolves a workspace plugin with no document', async () => {
    const pings = {
      read: () => useCapability(WorkspaceToken),
      pick: (workspace: unknown) => (workspace as { ping(): string }).ping(),
      seen: [] as unknown[],
    };
    await viewerWith(plugins, Probes, { probes: [pings] });
    expect(pings.seen).toContain('pong');
  });

  it("throws the kernel's reason for a token no plugin provides, and from useSelector", async () => {
    const MissingToken = createCapabilityToken<{ ping(): string }>('missing');
    const missing = { read: () => useCapability(MissingToken), pick: () => 0, seen: [] };
    const first = await viewerWith(plugins, Guarded, {
      content: Probes,
      props: { probes: [missing] },
    });
    await waitFor(() =>
      expect(first.view.getByTestId('caught').textContent).toContain('No capability "missing"'),
    );
    first.view.unmount();

    const selector = {
      read: () => useSelector(CounterToken, (counter) => counter.getCount()),
      pick: (value: unknown) => (value as { current: number }).current,
      seen: [],
    };
    const second = await viewerWith(plugins, Guarded, {
      content: Probes,
      props: { probes: [selector] },
    });
    await waitFor(() =>
      expect(second.view.getByTestId('caught').textContent).toContain(
        '"counter" requires an active document',
      ),
    );
  });
});

describe('the handle in reactions', () => {
  it('a read follows the kernel; a verb subscribes to nothing', async () => {
    const counts: unknown[] = [];
    const verbRuns: unknown[] = [];
    const { kernel, view } = await viewerWith(plugins, HandleProbe, { counts, verbRuns });
    expect(latest(counts)).toBe('not-ready');

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(counts)).toBe(0);
    expect(verbRuns).toEqual(['a']);

    kernel.capability(CounterToken).increment();
    flushSync();
    expect(latest(counts)).toBe(1);
    expect(view.getByTestId('count').textContent).toBe('1');
    // The effect that called `touch()` didn't subscribe to the kernel through it.
    expect(verbRuns).toEqual(['a']);
  });
});
