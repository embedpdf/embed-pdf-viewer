<!--
  One page with a layer on it, for layer tests: it provides `page` to the layer, inside an element
  that records every press reaching it (`onPress`) with a delegated listener, as a page's own
  handlers would be.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import { setPageContext, type PageContextValue } from '../../src/runtime';

  let {
    page,
    layer,
    layerProps = {},
    onPress,
  }: {
    page: PageContextValue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer: Component<any>;
    layerProps?: Record<string, unknown>;
    onPress?: () => void;
  } = $props();

  // One page per fixture: it never changes.
  // svelte-ignore state_referenced_locally
  setPageContext(page);
  const Layer = $derived(layer);
</script>

<div data-testid="page-{page.ref.objectNumber}" onpointerdown={onPress} role="presentation">
  <Layer {...layerProps} />
</div>
