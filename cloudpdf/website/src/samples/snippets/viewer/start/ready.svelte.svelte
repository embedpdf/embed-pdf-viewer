<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  function onready(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} {onready} style="height: 100vh" />
