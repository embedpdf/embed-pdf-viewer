<!-- On load: the document's rich text box, selected. -->
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
      const richText = annotation.list().find((each) => each.nm === 'rich-text');
      if (!richText) return;
      annotation.selection.set([richText.ref]);
      stage.reveal(richText.page, { rect: richText.rect });
    });
  });
</script>
