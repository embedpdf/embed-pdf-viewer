<script lang="ts">
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  // Read on every selection change, so the buttons follow what's selected.
  const annotations = useAnnotationState();
  const nothing = $derived(annotations.selected.length === 0);
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={nothing}
    onclick={() => annotation.selection.rotateBy(-90)}
  >
    ↺ Turn left
  </button>
  <button
    type="button"
    class="button"
    disabled={nothing}
    onclick={() => annotation.selection.rotateBy(90)}
  >
    ↻ Turn right
  </button>
  <button
    type="button"
    class="button"
    disabled={nothing}
    onclick={() => annotation.selection.resetRotation()}
  >
    Upright
  </button>
  <span class="spacer"></span>
  <button
    type="button"
    class="button"
    disabled={!annotation.selection.canGroup()}
    onclick={() => annotation.selection.group()}
  >
    Group
  </button>
  <button
    type="button"
    class="button"
    disabled={!annotation.selection.canUngroup()}
    onclick={() => annotation.selection.ungroup()}
  >
    Ungroup
  </button>
</div>
