<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  function onready(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
  }
</script>

<PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} {onready} style="height: 100vh" />
