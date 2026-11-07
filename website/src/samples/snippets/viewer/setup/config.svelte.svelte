<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  const onready = (viewer: Viewer) => console.log('ready', viewer);
</script>

<PDFViewer
  src="https://www.embedpdf.com/pdfs/welcome.pdf"
  theme="system"
  disable={['forms']}
  {onready}
  style="height: 100vh"
/>
