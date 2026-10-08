<script lang="ts">
  import { PDFViewer, ToolbarItem, type Viewer } from '@embedpdf/viewer-svelte';
  import FirstPage from './FirstPage.svelte'; // uses usePDFViewer() inside the viewer

  // Outside the viewer: keep it from onready.
  let viewer = $state.raw<Viewer | null>(null);
</script>

<button disabled={!viewer} onclick={() => viewer?.commands.execute('document:print')}>Print</button>
<PDFViewer src="/report.pdf" onready={(v) => (viewer = v)} style="height: 80vh">
  <ToolbarItem id="first-page"><FirstPage /></ToolbarItem>
</PDFViewer>
