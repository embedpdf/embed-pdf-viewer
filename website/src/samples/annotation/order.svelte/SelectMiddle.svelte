<!-- On load: the middle one of the document's three stacked rectangles, selected. -->
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
      const stack2 = annotation.list().find((each) => each.nm === 'stack-2');
      if (!stack2) return;
      annotation.selection.set([stack2.ref]);
      stage.reveal(stack2.page, { rect: stack2.rect });
    });
  });
</script>
