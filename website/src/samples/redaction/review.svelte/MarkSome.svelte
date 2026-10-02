<!-- On load: the author's name, and every "commercial" in the document. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useRedaction } from '@embedpdf/svelte/redaction';

  const redaction = useRedaction();
  const ready = useAnnotationState((state) => state.status === 'ready');

  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => {
      void redaction
        .markArea(0, { x: 100, y: 508, width: 172, height: 50 })
        .then(() => redaction.markMatches({ text: 'commercial' }));
    });
  });
</script>
