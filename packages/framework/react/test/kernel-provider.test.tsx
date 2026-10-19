// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  bytesInput,
  counterPlugin,
  counterState,
  CounterToken,
  viewerWith,
} from './counter-plugin';
import { KernelProvider, useKernel } from '../src/runtime';
import { stateHook } from '../src/state';

/**
 * `KernelProvider`: a subtree of another React root, given a kernel that a
 * `<Viewer>` elsewhere created, reads it with the same hooks, follows its
 * changes, and leaves it running when it unmounts.
 */

const useCounterState = stateHook(counterState);

function Count() {
  const { count } = useCounterState();
  return <output data-testid="count">{count}</output>;
}

afterEach(cleanup);

describe('KernelProvider', () => {
  it('gives a separate tree the hooks of a kernel it does not own', async () => {
    const { kernel } = await viewerWith([counterPlugin], null);
    await act(() => kernel.documents.open(bytesInput('a')));

    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    const tree = render(
      <KernelProvider kernel={kernel}>
        <Count />
      </KernelProvider>,
      { container: elsewhere },
    );
    expect(tree.getByTestId('count').textContent).toBe('0');

    act(() => kernel.capability(CounterToken).increment());
    expect(tree.getByTestId('count').textContent).toBe('1');

    tree.unmount();
    expect(kernel.status()).toBe('started');
    expect(kernel.capability(CounterToken).getCount()).toBe(1);
  });

  it('is the kernel useKernel returns', async () => {
    const { kernel } = await viewerWith([counterPlugin], null);
    let seen: unknown = null;
    function Probe() {
      seen = useKernel();
      return null;
    }
    render(
      <KernelProvider kernel={kernel}>
        <Probe />
      </KernelProvider>,
    );
    expect(seen).toBe(kernel);
  });
});
