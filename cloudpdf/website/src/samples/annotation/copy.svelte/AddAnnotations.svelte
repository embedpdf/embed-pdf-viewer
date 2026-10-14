<!-- On load: a rectangle and a text box on the cover, the rectangle selected and in view. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();

  let added = false;
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    untrack(() => {
      void annotation.create(cover, {
        subtype: 'free-text',
        box: { x: 300, y: 512, width: 230, height: 40 },
        contents: 'Copy me too',
        fontSize: 16,
        fontColor: '#1a2748',
        interiorColor: '#fffbe6',
      });
      void annotation
        .create(
          cover,
          {
            subtype: 'square',
            box: { x: 96, y: 506, width: 178, height: 54 },
            color: '#e5484d',
            interiorColor: '#ffe4e1',
            strokeWidth: 3,
          },
          undefined,
          { select: true },
        )
        .then(({ annotation: made }) => stage.reveal(cover, { rect: made.rect }));
    });
  });
</script>
