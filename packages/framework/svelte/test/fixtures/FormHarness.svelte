<!--
  A page with a `<FormLayer>` once the test hands it a page context (`page.value`), inside an
  element that records every press reaching it with a native listener, as the Stage listens.
  `probes` (see `Probes.svelte`) read beside the page.
-->
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import { FormLayer } from '../../src/form';
  import type { PageContextValue } from '../../src/runtime';
  import LayerPage from './LayerPage.svelte';
  import Probes from './Probes.svelte';

  let {
    page,
    stagePresses = [],
    probes = [],
  }: {
    page: { value: PageContextValue | null };
    stagePresses?: Event[];
    probes?: ComponentProps<typeof Probes>['probes'];
  } = $props();

  function stageBelow(element: HTMLElement) {
    const record = (event: Event) => stagePresses.push(event);
    element.addEventListener('pointerdown', record);
    return () => element.removeEventListener('pointerdown', record);
  }
</script>

<Probes {probes} />
<div {@attach stageBelow}>
  {#if page.value}
    {#key page.value}
      <LayerPage page={page.value} layer={FormLayer} />
    {/key}
  {/if}
</div>
