<!--
  The publish check's app (`tooling/build/src/check-framework-package.mjs`): the documented setup,
  type-checked against the packed package as a user installs it.
-->
<script lang="ts">
  import { PDFViewer, ToolbarItem, type Layout, type Viewer } from '@embedpdf/viewer-svelte';
  import Status from './Status.svelte';

  const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
  const onready = (viewer: Viewer) => viewer.commands.execute('zoom:in');
</script>

<PDFViewer
  src="/report.pdf"
  {layout}
  theme="system"
  disable={['forms']}
  style="height: 100vh"
  {onready}
  onpanelresize={({ id, width }) => console.log(id, width)}
>
  <ToolbarItem id="status"><Status /></ToolbarItem>
</PDFViewer>
