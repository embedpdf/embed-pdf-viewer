<!-- On load: two notes on the cover, one already accepted. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation, useAnnotationState, useComments } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const comments = useComments();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();

  let added = false;
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    untrack(() => {
      void annotation.create(cover, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten the title?',
        color: '#facc15',
      });
      void annotation
        .create(cover, {
          subtype: 'text',
          rect: { x: 280, y: 520, width: 20, height: 20 },
          contents: 'Add the co-author',
          color: '#facc15',
        })
        .then(({ annotation: note }) => comments.setStatus(note.ref, 'accepted'));
    });
  });
</script>
