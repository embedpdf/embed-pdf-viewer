<!-- Several pages, each with the same layer: `pages` are their page contexts. -->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { PageContextValue } from '../../src/runtime';
  import LayerPage from './LayerPage.svelte';

  let {
    pages,
    layer,
    layerProps = {},
    onPress,
  }: {
    pages: PageContextValue[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer: Component<any>;
    layerProps?: Record<string, unknown>;
    onPress?: () => void;
  } = $props();
</script>

{#each pages as page (page.ref.objectNumber)}
  <LayerPage {page} {layer} {layerProps} {onPress} />
{/each}
