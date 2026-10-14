<!-- Done and Cancel next to the shape being drawn, for touch screens. -->
<script lang="ts">
  import { AnnotationDraftMenu, useAnnotation } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
</script>

<AnnotationDraftMenu>
  {#snippet children(draft)}
    <div class="menu" role="toolbar" aria-label="Shape">
      <button type="button" disabled={!draft.canFinish} onclick={() => annotation.draft.finish()}>
        Done
      </button>
      <button type="button" onclick={() => annotation.draft.cancel()}>Cancel</button>
    </div>
  {/snippet}
</AnnotationDraftMenu>
