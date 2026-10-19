<!-- 2.x:

<script lang="ts">
  import { PDFViewer, type PluginRegistry } from '@embedpdf/svelte-pdf-viewer';

  const onready = (registry: PluginRegistry) => console.log('ready', registry);
</script>

<PDFViewer
  config={{
    src: { shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' },
    theme: { preference: 'dark' },
    disabledCategories: ['redaction', 'document-print'],
  }}
  style="height: 100vh"
  {onready}
/>
-->

<script lang="ts">
  import { PDFViewer, type Viewer } from '@cloudpdf/viewer-svelte';

  const onready = (viewer: Viewer) => console.log('ready', viewer);
</script>

<PDFViewer
  src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }}
  theme="dark"
  disable={['redaction', 'documents.print']}
  style="height: 100vh"
  {onready}
/>
