<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  // The top half of a page, where the box selects: on the home page, the image and the button.
  const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

  const annotation = useAnnotation();
  const annotations = useAnnotationState(); // annotations.selected: the selected annotations
  const pages = usePageList();
  const page = $derived(pages.current[0]?.ref); // the home page wireframe
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!page}
    onclick={() => page && annotation.selection.selectAll(page)}
  >
    Everything on the page
  </button>
  <button
    type="button"
    class="button"
    disabled={!page}
    onclick={() => page && annotation.selection.selectInRect(page, TOP_HALF)}
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
