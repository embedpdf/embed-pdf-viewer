import { computed, defineComponent, h, onErrorCaptured, ref, watchEffect } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { PluginError, createCapabilityToken, isPluginError } from '@embedpdf/core';
import type { AnyPlugin } from '@embedpdf/core';
import { useCapability, useCapabilityRef, useSelector } from '../src/runtime';
import {
  CounterToken,
  bytesInput,
  counterPlugin,
  probe,
  settle,
  viewerWith,
} from './counter-plugin';
import type { CounterCapability } from './counter-plugin';

/**
 * `useCapability` outside a document: a document plugin's object reaches a
 * stand-in that renders and whose methods refuse with `not-ready` (a method
 * that returns a promise rejects, the others throw), and the same object
 * reaches the capability once a document is ready; a workspace plugin always
 * resolves; a token no plugin provides, and the strict `useSelector`, still
 * throw the kernel's reason. In reactions, a read follows its answer and a
 * verb tracks nothing.
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

/** Catches what its content throws while it sets up or renders, and shows the message. */
const Boundary = defineComponent({
  setup(_props, { slots }) {
    const message = ref<string | null>(null);
    onErrorCaptured((error) => {
      message.value = error instanceof Error ? error.message : String(error);
      return false;
    });
    return () =>
      message.value === null
        ? slots.default?.()
        : h('div', { 'data-testid': 'caught' }, message.value);
  },
});

enableAutoUnmount(afterEach);

describe('useCapability without a document', () => {
  it('reaches a stand-in whose methods throw not-ready, then the capability once a document is ready', async () => {
    let counter: CounterCapability | null = null;
    const Probe = probe(() => {
      counter = useCapability(CounterToken);
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    const live = counter!;

    const error = refusal(() => live.increment());
    expect(error).toBeInstanceOf(PluginError);
    expect(isPluginError(error, 'not-ready')).toBe(true);
    expect((error as PluginError).capability).toBe('counter');
    expect((error as PluginError).message).toBe('no document is open');
    // Namespaces are stand-ins too.
    expect(
      isPluginError(
        refusal(() => live.notes.add('note')),
        'not-ready',
      ),
    ).toBe(true);

    await kernel.documents.open(bytesInput('a'));
    await settle();
    // The same object now calls the document's capability.
    expect(counter).toBe(live);
    live.increment();
    expect(kernel.capability(CounterToken).getCount()).toBe(1);
    expect(live.getCount()).toBe(kernel.capability(CounterToken).getCount());
    expect(live.getCount).toBe(live.getCount);

    await kernel.documents.close('a');
    await settle();
    expect(
      isPluginError(
        refusal(() => live.increment()),
        'not-ready',
      ),
    ).toBe(true);
  });

  it('is one stand-in per token, with stable members, and no thenable', async () => {
    const seen: CounterCapability[] = [];
    const Probe = probe(() => {
      seen.push(useCapabilityRef(CounterToken).value);
    });
    await viewerWith(plugins, () => [h(Probe), h(Probe)]);
    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(1);

    const standIn = seen[0];
    expect(standIn.increment).toBe(standIn.increment);
    expect(standIn.notes).toBe(standIn.notes);
    expect(standIn.notes.add).toBe(standIn.notes.add);
    expect((standIn as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(standIn)).resolves.toBe(standIn);
  });

  it('is no thenable and never made reactive itself', async () => {
    let counter: CounterCapability | null = null;
    const Probe = probe(() => {
      counter = useCapability(CounterToken);
    });
    await viewerWith(plugins, () => h(Probe));
    expect((counter as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(counter)).resolves.toBe(counter);
    // Vue leaves it as it is when it lands in reactive state.
    const state = ref<{ counter: CounterCapability | null }>({ counter: null });
    state.value.counter = counter;
    expect(state.value.counter).toBe(counter);
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
    const Probe = probe(() => {
      plain = useCapability(PlainToken);
    });
    await viewerWith([...plugins, plainPlugin], () => h(Probe));
    expect(
      isPluginError(
        refusal(() => plain!.getSettings()),
        'not-ready',
      ),
    ).toBe(true);
  });

  it('resolves a workspace plugin with no document', async () => {
    const pings: string[] = [];
    const Probe = probe(() => {
      pings.push(useCapability(WorkspaceToken).ping());
    });
    await viewerWith(plugins, () => h(Probe));
    expect(pings).toContain('pong');
  });

  it("still throws the kernel's reason for a token no plugin provides, and from useSelector", async () => {
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const MissingToken = createCapabilityToken<{ ping(): string }>('missing');
    const Missing = probe(() => {
      useCapability(MissingToken);
    });
    const Selector = probe(() => {
      const count = useSelector(CounterToken, (counter) => counter.getCount());
      return () => h('span', String(count.value));
    });

    const missing = await viewerWith(plugins, () => h(Boundary, () => h(Missing)));
    await settle();
    expect(missing.wrapper.text()).toContain('No capability "missing"');
    missing.wrapper.unmount();

    const selector = await viewerWith(plugins, () => h(Boundary, () => h(Selector)));
    await settle();
    expect(selector.wrapper.text()).toContain('"counter" requires an active document');
    quiet.mockRestore();
  });
});

describe('the live object in reactions', () => {
  it('rejects, rather than throws, from a method that returns a promise', async () => {
    let counter: CounterCapability | null = null;
    const Probe = probe(() => {
      counter = useCapability(CounterToken);
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    let saving: Promise<string> | null = null;
    expect(() => (saving = counter!.save('draft'))).not.toThrow();
    await expect(saving).rejects.toMatchObject({ code: 'not-ready', capability: 'counter' });
    await expect(counter!.notes.publish('note')).rejects.toMatchObject({ code: 'not-ready' });

    await kernel.documents.open(bytesInput('a'));
    await settle();
    await expect(counter!.save('kept')).resolves.toBe('kept');
  });

  it('a read in a computed follows its answer; a verb in an effect tracks nothing', async () => {
    let count: { readonly value: unknown } | null = null;
    const verbRuns: number[] = [];
    let counter: CounterCapability | null = null;
    const Probe = probe(() => {
      counter = useCapability(CounterToken);
      count = computed(() => {
        try {
          return counter!.getCount();
        } catch {
          return 'not-ready';
        }
      });
      watchEffect(() => {
        verbRuns.push(verbRuns.length);
        try {
          counter!.touch();
        } catch {
          // No document yet: the verb refuses, and the effect still depends on nothing.
        }
      });
      return () => h('span', String(count!.value));
    });
    const { kernel, wrapper } = await viewerWith(plugins, () => h(Probe));
    expect(count!.value).toBe('not-ready');

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(count!.value).toBe(0);
    kernel.capability(CounterToken).increment();
    await settle();
    expect(count!.value).toBe(1);
    expect(wrapper.text()).toContain('1');
    // The effect that called `touch()` ran once: through the verb it subscribed to nothing.
    expect(verbRuns).toEqual([0]);
  });
});
