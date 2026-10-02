<!-- On load: three filled rectangles stacked on the cover, the middle one selected. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const COLORS = [
    { color: '#e5484d', fill: '#ffd1d3' },
    { color: '#30a46c', fill: '#c9f0da' },
    { color: '#1e90ff', fill: '#cfe6ff' },
  ];

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();

  let added = false;
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    untrack(() => {
      COLORS.forEach(({ color, fill }, index) => {
        void annotation.create(
          cover,
          {
            subtype: 'square',
            box: { x: 300 + index * 50, y: 520 + index * 30, width: 160, height: 90 },
            color,
            interiorColor: fill,
            strokeWidth: 3,
          },
          undefined,
          { select: index === 1 },
        );
      });
    });
  });
</script>
