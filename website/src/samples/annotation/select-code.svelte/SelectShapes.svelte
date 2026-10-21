<!-- On load: the shapes page, with everything on it selected. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();

  let done = false;
  $effect(() => {
    const page = pages.current[2]?.ref;
    if (!ready.current || !page || done) return;
    done = true;
    untrack(() => {
      annotation.selection.selectAll(page);
      stage.goToPage(page);
    });
  });
</script>
