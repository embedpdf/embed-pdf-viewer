<script lang="ts">
  import { PDFViewer, ToolbarItem, type Viewer } from '@cloudpdf/viewer-svelte';
  import FirstPage from './FirstPage.svelte'; // uses usePDFViewer() inside the viewer

  // Outside the viewer: keep it from onready.
  let viewer = $state.raw<Viewer | null>(null);
</script>

<button disabled={!viewer} onclick={() => viewer?.commands.execute('document:print')}>Print</button>
<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} onready={(v) => (viewer = v)} style="height: 80vh">
  <ToolbarItem id="first-page"><FirstPage /></ToolbarItem>
</PDFViewer>
