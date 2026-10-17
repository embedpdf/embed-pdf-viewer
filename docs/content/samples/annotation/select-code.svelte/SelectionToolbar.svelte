<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  // The top half of the cover, where the box selects.
  const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

  const annotation = useAnnotation();
  const annotations = useAnnotationState(); // annotations.selected: the selected annotations
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!cover}
    onclick={() => cover && annotation.selection.selectAll(cover)}
  >
    Everything on the cover
  </button>
  <button
    type="button"
    class="button"
    disabled={!cover}
    onclick={() => cover && annotation.selection.selectInRect(cover, TOP_HALF)}
  >
    The top half
  </button>
  <button
    type="button"
    class="button"
    disabled={annotations.selected.length === 0}
    onclick={() => annotation.selection.clear()}
  >
    Clear
  </button>
  <span class="spacer"></span>
  <output class="readout">{annotations.selected.length} selected</output>
</div>
