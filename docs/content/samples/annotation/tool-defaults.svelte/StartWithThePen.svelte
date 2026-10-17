<!-- On load: the pen is active, with a stroke drawn in its current style. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();
  let added = false;

  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    const wave = Array.from({ length: 24 }, (_, i) => ({
      x: 300 + i * 10,
      y: 540 + Math.sin(i / 2) * 14,
    }));
    void annotation.create(cover, { subtype: 'ink', inkList: [wave] }, undefined, { tool: 'ink' });
    interaction.activateTool('ink');
  });
</script>
