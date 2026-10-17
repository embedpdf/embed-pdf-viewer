<script lang="ts">
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';

  let { onPick }: { onPick: (page: PageRef) => void } = $props();
  const pages = usePageList();
</script>

{#each pages.current as page (page.index)}
  <button onclick={() => onPick(page.ref)}>
    <PageView page={page.ref} width={120}>
      <RenderLayer />
    </PageView>
    {page.label ?? page.index + 1}
  </button>
{/each}
