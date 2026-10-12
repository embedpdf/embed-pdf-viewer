import { defineComponent, h, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import type { Kernel } from '@embedpdf/core';
import { resetDevWarnings } from '../src/dev';
import { KernelProvider, useKernel } from '../src/runtime';
import { stateComposable } from '../src/state';
import {
  CounterToken,
  bytesInput,
  counterPlugin,
  counterState,
  settle,
  viewerWith,
} from './counter-plugin';

/**
 * `<KernelProvider>`: a separate app, given a kernel that a `<Viewer>`
 * elsewhere created, reads it with the same composables, follows its changes,
 * and leaves it running when it unmounts.
 */

enableAutoUnmount(afterEach);

const useCounterState = stateComposable(counterState);

const Count = defineComponent({
  setup() {
    const { count } = useCounterState();
    return () => h('output', { 'data-testid': 'count' }, String(count.value));
  },
});

describe('<KernelProvider>', () => {
  it('gives a separate app the composables of a kernel it does not own', async () => {
    const { kernel } = await viewerWith([counterPlugin], () => null);
    await kernel.documents.open(bytesInput('a'));
    await settle();

    const elsewhere = mount(KernelProvider, {
      props: { kernel },
      slots: { default: () => h(Count) },
      attachTo: document.body,
    });
    expect(elsewhere.find('[data-testid="count"]').text()).toBe('0');

    kernel.capability(CounterToken).increment();
    await settle();
    expect(elsewhere.find('[data-testid="count"]').text()).toBe('1');

    elsewhere.unmount();
    expect(kernel.status()).toBe('started');
    expect(kernel.capability(CounterToken).getCount()).toBe(1);
  });

  it('is the kernel useKernel returns', async () => {
    const { kernel } = await viewerWith([counterPlugin], () => null);
    let seen: Kernel | null = null;
    const Probe = defineComponent({
      setup() {
        seen = useKernel();
        return () => null;
      },
    });
    mount(KernelProvider, { props: { kernel }, slots: { default: () => h(Probe) } });
    expect(seen).toBe(kernel);
  });

  it('reads the kernel once: another one warns and is ignored', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = (await viewerWith([counterPlugin], () => null)).kernel;
    const second = (await viewerWith([counterPlugin], () => null)).kernel;
    const given = shallowRef(first);
    let seen: Kernel | null = null;
    const Probe = defineComponent({
      setup() {
        seen = useKernel();
        return () => null;
      },
    });
    const Host = defineComponent({
      setup: () => () => h(KernelProvider, { kernel: given.value }, () => h(Probe)),
    });
    mount(Host);
    given.value = second;
    await settle();
    expect(seen).toBe(first);
    expect(warn.mock.calls.some(([message]) => String(message).includes('read once'))).toBe(true);
    warn.mockRestore();
  });
});
