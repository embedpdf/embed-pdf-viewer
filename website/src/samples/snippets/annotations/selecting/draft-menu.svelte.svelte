<script lang="ts">
  import { AnnotationDraftMenu, useAnnotation } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
</script>

<AnnotationDraftMenu>
  {#snippet children(draft)}
    <button disabled={!draft.canFinish} onclick={() => annotation.draft.finish()}>Done</button>
    <button onclick={() => annotation.draft.cancel()}>Cancel</button>
  {/snippet}
</AnnotationDraftMenu>
