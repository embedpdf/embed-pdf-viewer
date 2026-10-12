<!-- The viewer with the app's search box in its toolbar (`AppSearch.svelte`). -->
<script lang="ts">
  import { PDFViewer, ToolbarItem, type LayoutFunction } from '@embedpdf/viewer-svelte';
  import AppSearch from './AppSearch.svelte';
  import type { HooksRecord } from './hooks';

  let { record }: { record: HooksRecord } = $props();

  const layout: LayoutFunction = (base) =>
    base.add(
      { custom: 'app-search', command: 'panel:search', importance: 5 },
      { to: 'main', section: 'start', group: 'app' },
    );
</script>

<PDFViewer
  src="/sample.pdf"
  {layout}
  style="height: 100vh; display: block"
  onready={(viewer) => (record.viewer = viewer)}
>
  <ToolbarItem id="app-search">
    <AppSearch />
  </ToolbarItem>
</PDFViewer>
