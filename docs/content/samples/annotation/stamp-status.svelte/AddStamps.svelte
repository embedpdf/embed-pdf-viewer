<!--
  On load: two approval stamps on the cover, one signed off. The second sits at the bottom, so its
  status hangs over the next page.
-->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();
  let added = false;

  // The stamp's picture, drawn on a canvas so the example needs no image file.
  function approvedPicture(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 120;
    const context = canvas.getContext('2d')!;
    context.strokeStyle = '#30a46c';
    context.lineWidth = 10;
    context.strokeRect(5, 5, 350, 110);
    context.fillStyle = '#30a46c';
    context.font = 'bold 54px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('APPROVED', 180, 64);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
  }

  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    void approvedPicture().then(async (appearance) => {
      await annotation.create(
        cover,
        {
          subtype: 'stamp',
          box: { x: 330, y: 470, width: 180, height: 60 },
          name: 'approval-budget',
        },
        { appearance },
      );
      await annotation.create(
        cover,
        {
          subtype: 'stamp',
          box: { x: 96, y: 712, width: 180, height: 60 },
          name: 'approval-contract',
        },
        { appearance },
      );
    });
  });
</script>
