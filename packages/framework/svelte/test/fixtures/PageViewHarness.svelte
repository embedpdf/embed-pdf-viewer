<!--
  Two page views: one by index with a fallback, its template taking the page as a snippet
  argument; one by ref with a reserved band, its layer reading the page through `usePage()`.
-->
<script lang="ts">
  import { PageView } from '../../src/page-view';
  import { toPageRef } from '../../src/runtime';
  import PageProbe from './PageProbe.svelte';
</script>

<PageView page={0} class="by-index">
  {#snippet children(page)}
    <span class="by-index-probe" data-ref={page.ref.objectNumber} data-index={page.pageIndex}
    ></span>
  {/snippet}
  {#snippet fallback()}
    <p class="waiting"></p>
  {/snippet}
</PageView>
<PageView page={toPageRef(1)} pageFrame={{ bottom: 20 }} class="by-ref">
  <PageProbe />
</PageView>
