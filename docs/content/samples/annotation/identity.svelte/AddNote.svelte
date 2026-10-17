<!-- On load: a sticky note on the cover. It's Dana's, like everything drawn here. -->
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
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
  });
</script>
