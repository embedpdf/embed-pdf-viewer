<!-- On load: a rectangle on the cover, selected so its handles show. -->
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
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#1a2748',
        strokeWidth: 2,
      },
      undefined,
      { select: true },
    );
  });
</script>
