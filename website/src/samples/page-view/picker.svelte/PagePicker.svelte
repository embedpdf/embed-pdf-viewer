<script lang="ts">
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';

  const pages = usePageList();
  let picked = $state.raw<PageRef | null>(null);
  // A ref follows its page when pages move, so it's what you keep.
  const shown = $derived(picked ?? pages.current[0]?.ref ?? null);
</script>

<div class="picker">
  <div class="choices" role="listbox" aria-label="Pages">
    {#each pages.current as page (page.ref.objectNumber)}
      <button
        type="button"
        role="option"
        class="choice"
        aria-selected={page.ref.objectNumber === shown?.objectNumber}
        onclick={() => (picked = page.ref)}
      >
        <PageView page={page.ref} width={84}>
          <RenderLayer />
        </PageView>
        <span class="number">{page.label ?? page.index + 1}</span>
      </button>
    {/each}
  </div>
  <div class="shown">
    {#if shown}
      <PageView page={shown} width={300}>
        <RenderLayer />
      </PageView>
    {/if}
  </div>
</div>
