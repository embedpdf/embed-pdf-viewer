<!-- On load: a rectangle and a text box on the cover, the text box selected so the menu shows. -->
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
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#1e90ff',
      strokeWidth: 3,
    });
    void annotation.create(
      cover,
      {
        subtype: 'free-text',
        box: { x: 300, y: 512, width: 230, height: 40 },
        contents: 'Ready for review',
        fontSize: 16,
        fontColor: '#1a2748',
        interiorColor: '#fffbe6',
      },
      undefined,
      { select: true },
    );
  });
</script>
