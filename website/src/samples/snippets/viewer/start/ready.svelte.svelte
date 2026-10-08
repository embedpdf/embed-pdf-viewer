<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  function onready(viewer: Viewer) {
    viewer.documents.onOpened(() => viewer.get('search').search('total'));
  }
</script>

<PDFViewer src="/report.pdf" {onready} style="height: 100vh" />
