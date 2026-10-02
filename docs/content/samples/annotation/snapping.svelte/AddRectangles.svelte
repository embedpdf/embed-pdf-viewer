<!-- On load: two rectangles on the cover, the right one selected. Drag it next to the other. -->
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
        subtype: 'square',
        box: { x: 340, y: 560, width: 120, height: 80 },
        color: '#e5484d',
        strokeWidth: 3,
      },
      undefined,
      { select: true },
    );
  });
</script>
