<!-- On load: a text box born with formatting, selected. Runs change the body only where they differ. -->
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
        subtype: 'free-text',
        box: { x: 106, y: 570, width: 380, height: 60 },
        interiorColor: '#fffbe6',
        richText: {
          body: { family: 'Helvetica', size: 16, color: '#1a2748' },
          paragraphs: [
            {
              runs: [
                { text: 'Double-click me, select a word, then make it ' },
                { text: 'bold', style: { weight: 700 } },
                { text: ' or ' },
                { text: 'red', style: { color: '#c00000' } },
                { text: '.' },
              ],
            },
          ],
        },
      },
      undefined,
      { select: true },
    );
  });
</script>
