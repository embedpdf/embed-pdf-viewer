/** Render a component inside a `<Viewer>` and wait until it's mounted. */
import { render, waitFor } from '@testing-library/svelte';
import { flushSync, type Component } from 'svelte';
import type { AnyPlugin, Engine, Kernel } from '@embedpdf/core';
import { counterEngine } from './counter-plugin';
import WithViewer from './WithViewer.svelte';

export async function viewerWith(
  plugins: AnyPlugin[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Component<any>,
  props: Record<string, unknown> = {},
  engine: Engine = counterEngine,
) {
  let kernel: Kernel | null = null;
  const view = render(WithViewer, {
    props: {
      engine,
      plugins,
      content,
      contentProps: props,
      onReady: (ready: Kernel) => (kernel = ready),
    },
  });
  await waitFor(() => view.getByTestId('mounted'));
  flushSync();
  return { kernel: kernel as unknown as Kernel, view };
}

/** The last value in a list of recorded values. */
export const latest = <T>(values: readonly T[]): T => values[values.length - 1]!;
