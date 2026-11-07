<script lang="ts">
  import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-svelte';
  import DocumentStatus from './DocumentStatus.svelte';

  const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<PDFViewer src="https://www.embedpdf.com/pdfs/welcome.pdf" {layout} style="height: 100vh">
  <ToolbarItem id="status">
    <DocumentStatus />
  </ToolbarItem>
</PDFViewer>
