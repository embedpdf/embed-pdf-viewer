<!-- On load: the document's square and circle, both selected. -->
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
        .filter((each) => each.nm === 'square' || each.nm === 'circle');
      if (found.length === 0) return;
      annotation.selection.set(found.map((each) => each.ref));
      stage.reveal(found[0].page, { rect: found[0].rect });
    });
  });
</script>
