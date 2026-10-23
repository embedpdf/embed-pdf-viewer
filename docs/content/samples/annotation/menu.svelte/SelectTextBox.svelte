<!-- On load: the document's text box, selected, so its menu shows. -->
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
      const textBox = annotation.list().find((each) => each.nm === 'text-box');
      if (!textBox) return;
      annotation.selection.set([textBox.ref]);
      stage.reveal(textBox.page, { rect: textBox.rect });
    });
  });
</script>
