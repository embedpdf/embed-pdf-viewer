import { flushSync } from 'svelte';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { stateReader, useKernel } from '../../src/runtime';
import { CounterToken, bytesInput, counterPlugin, counterState } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import Provided from '../fixtures/Provided.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `<KernelProvider>`: components outside the `<Viewer>` that created a kernel, given it, read it
 * with the same readers, follow its changes, and leave it running when they unmount.
 */

const useCounterState = stateReader(counterState);

const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [] as unknown[],
});

describe('KernelProvider', () => {
  it('gives components elsewhere the readers of a kernel it does not own', async () => {
    const { kernel } = await viewerWith([counterPlugin], Probes, { probes: [] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();

    const count = probe(
      () => useCounterState(),
      (state) => state.count,
    );
    const elsewhere = render(Provided, { props: { kernel, probes: [count] } });
    flushSync();
    expect(latest(count.seen)).toBe(0);

    kernel.capability(CounterToken).increment();
    flushSync();
    expect(latest(count.seen)).toBe(1);

    elsewhere.unmount();
    expect(kernel.status()).toBe('started');
    expect(kernel.capability(CounterToken).getCount()).toBe(1);

    // Unmounted, the provider stops following the kernel.
    const runs = count.seen.length;
    kernel.capability(CounterToken).increment();
    flushSync();
    expect(count.seen).toHaveLength(runs);
  });

  it('is the kernel useKernel() returns', async () => {
    const { kernel } = await viewerWith([counterPlugin], Probes, { probes: [] });
    const seen = probe(
      () => useKernel(),
      (provided) => provided,
    );
    render(Provided, { props: { kernel, probes: [seen] } });
    flushSync();
    expect(latest(seen.seen)).toBe(kernel);
  });
});
