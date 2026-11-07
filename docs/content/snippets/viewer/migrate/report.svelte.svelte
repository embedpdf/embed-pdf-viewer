<!-- 2.x:

<script lang="ts">
  import { PDFViewer, type PluginRegistry } from '@embedpdf/svelte-pdf-viewer';

  const onready = (registry: PluginRegistry) => console.log('ready', registry);
</script>

<PDFViewer
  config={{
    src: 'https://www.embedpdf.com/pdfs/welcome.pdf',
    theme: { preference: 'dark' },
    disabledCategories: ['redaction', 'document-print'],
  }}
  style="height: 100vh"
  {onready}
/>
-->

<script lang="ts">
  import { PDFViewer, type Viewer } from '@embedpdf/viewer-svelte';

  const onready = (viewer: Viewer) => console.log('ready', viewer);
</script>

<PDFViewer
  src="https://www.embedpdf.com/pdfs/welcome.pdf"
  theme="dark"
  features={{ 'documents.print': false }}
  style="height: 100vh"
  {onready}
/>
