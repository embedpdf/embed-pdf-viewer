<!--
  A page view with a `<RenderLayer>`, with `painter` a layer that paints annotations, and with
  `indicator` a layer that shows the page's picture state: the test changes its page through
  `page.value`, and takes it away through `shown.value`.
-->
<script lang="ts">
  import { PageView } from '../../src/page-view';
  import { RenderLayer } from '../../src/render';
  import PaintsAnnotations from './PaintsAnnotations.svelte';
  import PictureIndicator from './PictureIndicator.svelte';

  let {
    page,
    shown,
    painter = false,
    indicator = false,
  }: {
    page: { value: number };
    shown: { value: boolean };
    painter?: boolean;
    indicator?: boolean;
  } = $props();
</script>

{#if shown.value}
  <PageView page={page.value} width={300}>
    <RenderLayer />
    {#if painter}
      <PaintsAnnotations />
    {/if}
    {#if indicator}
      <PictureIndicator />
    {/if}
  </PageView>
{/if}
