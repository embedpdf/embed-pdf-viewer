<!-- Rotates the page you're on, in the file: the turn is kept when the document is downloaded. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { usePageEdit } from '@embedpdf/svelte/page-edit';
  import { useStageState } from '@embedpdf/svelte/stage';

  const pageEdit = usePageEdit();
  const pages = usePageList();
  const currentPageIndex = useStageState((state) => state.currentPageIndex);
  const page = $derived(pages.current[currentPageIndex.current]);
  const canEdit = $derived(pageEdit.canEdit());

  // The first page starts a quarter turn clockwise. setRotation() sets the same rotation
  // however often it runs; rotateBy() would turn it again.
  onMount(() => {
    void pageEdit.setRotation([0], 90);
  });
</script>

{#if page}
  <div class="toolbar">
    <output class="readout">
      Page {currentPageIndex.current + 1} · {page.rotation}°
    </output>
    <span class="spacer"></span>
    <button
      type="button"
      class="button"
      disabled={!canEdit}
      onclick={() => pageEdit.rotateBy([page.ref], -90)}
    >
      ⟲ Rotate left
    </button>
    <button
      type="button"
      class="button"
      disabled={!canEdit}
      onclick={() => pageEdit.rotateBy([page.ref], 90)}
    >
      ⟳ Rotate right
    </button>
    <button
      type="button"
      class="button"
      disabled={!canEdit}
      onclick={() =>
        pageEdit.setRotation(
          pages.current.map((each) => each.ref),
          0,
        )}
    >
      Every page upright
    </button>
  </div>
{/if}
