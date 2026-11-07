<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
  import { config } from './viewer-config';
</script>

<PDFViewer src="https://www.embedpdf.com/pdfs/welcome.pdf" {...config} style="height: 100vh" />
