<!-- On load: a rectangle and a circle on the cover, both selected. -->
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
    void Promise.all([
      annotation.create(cover, {
        subtype: 'square',
        box: { x: 300, y: 560, width: 140, height: 60 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
        strokeWidth: 3,
      }),
      annotation.create(cover, {
        subtype: 'circle',
        box: { x: 460, y: 550, width: 80, height: 80 },
        color: '#1e90ff',
        strokeWidth: 3,
      }),
    ]).then((created) => annotation.selection.set(created.map((c) => c.annotation.ref)));
  });
</script>
