<!-- On load: the document's frame and word, both selected, scrolled into view. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useStage } from '@embedpdf/svelte/stage';

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
        .filter((each) => each.nm === 'checked-frame' || each.nm === 'checked-text');
      if (found.length === 0) return;
      annotation.selection.set(found.map((each) => each.ref));
      stage.reveal(found[0].page, { rect: found[0].rect });
    });
  });
</script>
