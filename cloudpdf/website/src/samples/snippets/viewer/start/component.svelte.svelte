<script lang="ts">
  import { PDFViewer, ToolbarItem, type Layout } from '@cloudpdf/viewer-svelte';
  import DocumentStatus from './DocumentStatus.svelte';

  const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} {layout} style="height: 100vh">
  <ToolbarItem id="status">
    <DocumentStatus />
  </ToolbarItem>
</PDFViewer>
