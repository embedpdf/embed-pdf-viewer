<!-- On load: a text file pinned to the cover, and the stamp tool active. -->
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
    const notes = new File(['Questions for the next review.'], 'notes.txt', { type: 'text/plain' });
    void annotation.create(
      cover,
      { subtype: 'file-attachment', rect: { x: 470, y: 232, width: 20, height: 20 } },
      { file: notes },
    );
    interaction.activateTool('stamp');
  });
</script>
