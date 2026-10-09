<!-- A layer that paints the page's annotations itself, as `<AnnotationLayer>` does. -->
<script lang="ts">
  import { usePage } from '../../src/runtime/page';
  import { usePaintsPagePart } from '../../src/runtime/page-layers.svelte';

  const page = usePage();
  usePaintsPagePart(() => page.ref, 'annotations');
</script>
