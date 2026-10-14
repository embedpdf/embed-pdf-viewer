<!-- On load: a text box on the cover, selected. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();
  let added = false;

  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    void annotation.create(
      cover,
      {
        subtype: 'free-text',
        box: { x: 106, y: 570, width: 380, height: 60 },
        contents: 'Double-click to type in your own text box',
        fontSize: 16,
        fontColor: '#1a2748',
      },
      undefined,
      { select: true },
    );
  });
</script>
