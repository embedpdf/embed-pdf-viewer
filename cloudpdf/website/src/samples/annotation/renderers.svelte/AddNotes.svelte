<!-- On load: two notes on the cover, 24 points square: 32 pixels at 100%. -->
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
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 470, y: 228, width: 24, height: 24 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 280, y: 516, width: 24, height: 24 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
  });
</script>
