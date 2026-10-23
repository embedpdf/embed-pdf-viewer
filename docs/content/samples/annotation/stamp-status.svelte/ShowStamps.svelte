<!--
  On load: the page with the document's two approval stamps, the budget one already signed off.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');

  let done = false;
  $effect(() => {
    if (!ready.current || done) return;
    done = true;
    untrack(() => {
      const found = annotation
        .list()
        .filter((each) => each.nm === 'approval-budget' || each.nm === 'approval-contract');
      if (found.length === 0) return;
      stage.reveal(found[0].page, { rect: found[0].rect });
    });
  });
</script>
