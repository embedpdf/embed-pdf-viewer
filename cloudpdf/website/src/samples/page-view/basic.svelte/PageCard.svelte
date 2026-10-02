<!-- A card that shows one page, like a preview next to a search result or a comment. -->
<script lang="ts">
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { usePageList } from '@embedpdf/svelte/runtime';

  const pages = usePageList();
  let index = $state(0);
  const page = $derived(pages.current[index]);
</script>

<figure class="card">
  <PageView page={index} width={220} class="page">
    <RenderLayer />
  </PageView>
  <figcaption class="caption">
    <strong class="title">Page {page?.label ?? index + 1}</strong>
    {#if page}
      <span class="detail">
        {Math.round(page.size.width)} × {Math.round(page.size.height)} points
      </span>
    {/if}
    <span class="pager">
      <button type="button" class="button" disabled={index === 0} onclick={() => index--}>
        ‹ Previous
      </button>
      <button
        type="button"
        class="button"
        disabled={index >= pages.current.length - 1}
        onclick={() => index++}
      >
        Next ›
      </button>
    </span>
  </figcaption>
</figure>
