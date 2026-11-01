<!-- On load: the document's circle, selected. Drag it toward the square to see it snap. -->
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
      const circle = annotation.list().find((each) => each.nm === 'circle');
      if (!circle) return;
      annotation.selection.set([circle.ref]);
      stage.reveal(circle.page, { rect: circle.rect });
    });
  });
</script>
