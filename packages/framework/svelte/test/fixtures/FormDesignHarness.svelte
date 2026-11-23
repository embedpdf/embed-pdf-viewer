<!--
  A page that fills a form in and designs it, once the test hands it a page context
  (`page.value`): an `<AnnotationLayer>` and a `<FormLayer>` (see `FormDesignLayers.svelte`).
  `probes` (see `Probes.svelte`) read beside the page.
-->
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import type { PageContextValue } from '../../src/runtime';
  import FormDesignLayers from './FormDesignLayers.svelte';
  import LayerPage from './LayerPage.svelte';
  import Probes from './Probes.svelte';

  let {
    page,
    probes = [],
  }: {
    page: { value: PageContextValue | null };
    probes?: ComponentProps<typeof Probes>['probes'];
  } = $props();
</script>

<Probes {probes} />
{#if page.value}
  {#key page.value}
    <LayerPage page={page.value} layer={FormDesignLayers} />
  {/key}
{/if}
