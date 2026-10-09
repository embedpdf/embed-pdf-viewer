<!-- On load: two notes and a rectangle on the cover, each with a comment. -->
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
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 280, y: 520, width: 20, height: 20 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 376, width: 360, height: 118 },
      contents: 'This subtitle reads well',
      color: '#30a46c',
      strokeWidth: 3,
    });
  });
</script>
