<!-- On load: the cover's subtitle, and every "Adobe" in the document. -->
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
        .markArea(0, { x: 44, y: 318, width: 206, height: 50 })
        .then(() => redaction.markMatches({ text: 'Adobe' }));
    });
  });
</script>
