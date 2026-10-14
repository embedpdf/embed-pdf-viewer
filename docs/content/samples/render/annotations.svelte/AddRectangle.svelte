<!-- A rectangle on the first page, made on load so there's an annotation to show. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useAnnotation } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const pages = usePageList();

  let added = false;
  $effect(() => {
    const firstPage = pages.current[0]?.ref;
    if (!firstPage || added) return;
    added = true;
    untrack(() => {
      void annotation.create(firstPage, {
        subtype: 'square',
        box: { x: 72, y: 96, width: 300, height: 140 },
        color: '#e11d48',
        interiorColor: '#ffe4e6',
        opacity: 0.7,
        strokeWidth: 3,
      });
    });
  });
</script>
