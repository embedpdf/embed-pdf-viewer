<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  const onready = (viewer: Viewer) => console.log('ready', viewer);
</script>

<PDFViewer src="/report.pdf" theme="system" features={{ forms: false }} {onready} style="height: 100vh" />
