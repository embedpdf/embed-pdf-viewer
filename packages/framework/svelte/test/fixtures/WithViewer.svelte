<!-- A `<Viewer>` around one component, for tests: `content` with `contentProps`, and its kernel through `onReady`. -->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { AnyPlugin, Engine, Kernel } from '@embedpdf/core';
  import { Viewer } from '../../src/runtime';

  let {
    engine,
    plugins,
    onReady,
    content,
    contentProps = {},
  }: {
    engine: Engine;
    plugins: AnyPlugin[];
    onReady?: (kernel: Kernel) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: Component<any>;
    contentProps?: Record<string, unknown>;
  } = $props();

  const Content = $derived(content);
</script>

<Viewer {engine} {plugins} {onReady}>
  <div data-testid="mounted"><Content {...contentProps} /></div>
</Viewer>
