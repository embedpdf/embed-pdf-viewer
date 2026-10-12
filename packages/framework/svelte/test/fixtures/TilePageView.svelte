<!--
  A page view with a `<RenderLayer>`, and with `painter` a layer that paints annotations: the test
  changes its page through `page.value`, and takes it away through `shown.value`.
-->
<script lang="ts">
  import { PageView } from '../../src/page-view';
  import { RenderLayer } from '../../src/render';
  import PaintsAnnotations from './PaintsAnnotations.svelte';

  let {
    page,
    shown,
    painter = false,
  }: { page: { value: number }; shown: { value: boolean }; painter?: boolean } = $props();
</script>

{#if shown.value}
  <PageView page={page.value} width={300}>
    <RenderLayer />
    {#if painter}
      <PaintsAnnotations />
    {/if}
  </PageView>
{/if}
