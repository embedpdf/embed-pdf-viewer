<!-- On load: a highlight, a rectangle, a sticky note and a text box on the cover. -->
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
      subtype: 'highlight',
      quadPoints: [
        {
          upperLeft: { x: 106, y: 218 },
          upperRight: { x: 458, y: 218 },
          lowerLeft: { x: 106, y: 267 },
          lowerRight: { x: 458, y: 267 },
        },
      ],
      color: '#ffcd45',
    });
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#e5484d',
      strokeWidth: 3,
    });
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'A good title',
      color: '#facc15',
    });
    void annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Double-click to type here',
      fontSize: 16,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
    });
  });
</script>
