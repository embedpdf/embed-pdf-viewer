<script lang="ts">
  import { PDFViewer, type Layout } from '@cloudpdf/viewer-svelte';

  let { toolbarBelow }: { toolbarBelow: boolean } = $props();

  const toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
</script>

<!-- A new key mounts a new viewer with the new config. -->
{#key toolbarBelow}
  <PDFViewer
    src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }}
    layout={toolbarBelow ? toolbarAtBottom : undefined}
    style="height: 100vh"
  />
{/key}
