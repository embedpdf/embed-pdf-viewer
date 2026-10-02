<!--
  A page view with a `<RenderLayer>`: the test changes its page through `page.value`, and takes
  it away through `shown.value`.
-->
<script lang="ts">
  import { PageView } from '../../src/page-view';
  import { RenderLayer } from '../../src/render';

  let { page, shown }: { page: { value: number }; shown: { value: boolean } } = $props();
</script>

{#if shown.value}
  <PageView page={page.value} width={300}>
    <RenderLayer />
  </PageView>
{/if}
