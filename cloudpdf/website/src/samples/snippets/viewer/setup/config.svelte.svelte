<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  const onready = (viewer: Viewer) => console.log('ready', viewer);
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} theme="system" disable={['forms']} {onready} style="height: 100vh" />
