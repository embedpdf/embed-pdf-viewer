<script lang="ts">
  import { PDFViewer, type Layout } from '@cloudpdf/viewer-svelte';

  let { toolbarBelow }: { toolbarBelow: boolean } = $props();

  const toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
</script>

<!-- A new key mounts a new viewer with the new config. -->
{#key toolbarBelow}
  <PDFViewer
    src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }}
    layout={toolbarBelow ? toolbarAtBottom : undefined}
    style="height: 100vh"
  />
{/key}
