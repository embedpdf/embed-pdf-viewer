<!-- On load: the document's square, selected, so the panel shows its style. -->
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
      const square = annotation.list().find((each) => each.nm === 'square');
      if (!square) return;
      annotation.selection.set([square.ref]);
      stage.reveal(square.page, { rect: square.rect });
    });
  });
</script>
