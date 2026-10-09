<!-- On load: highlights, notes and a rectangle on the first two pages. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  // A line of text, as the four corners a highlight takes.
  const quad = (x: number, y: number, width: number, height: number) => ({
    upperLeft: { x, y },
    upperRight: { x: x + width, y },
    lowerLeft: { x, y: y + height },
    lowerRight: { x: x + width, y: y + height },
  });

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();

  let added = false;
  $effect(() => {
    const [cover, second] = pages.current;
    if (!ready.current || !cover || !second || added) return;
    added = true;
    untrack(() => {
      void annotation.create(cover.ref, {
        subtype: 'highlight',
        quadPoints: [quad(106, 218, 352, 49)],
        color: '#ffcd45',
        contents: 'The title',
      });
      void annotation.create(cover.ref, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten it?',
        color: '#facc15',
      });
      void annotation.create(second.ref, {
        subtype: 'highlight',
        quadPoints: [quad(57, 57, 242, 36), quad(57, 93, 265, 36)],
        color: '#ffcd45',
        contents: 'The opening line',
      });
      void annotation.create(second.ref, {
        subtype: 'square',
        box: { x: 52, y: 580, width: 470, height: 64 },
        color: '#e5484d',
        strokeWidth: 2,
        contents: 'Rewrite this paragraph',
      });
    });
  });
</script>
