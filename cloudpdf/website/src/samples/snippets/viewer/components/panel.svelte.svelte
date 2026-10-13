<script lang="ts">
  import { PDFViewer, Panel, type Layout } from '@cloudpdf/viewer-svelte';
  import Notes from './Notes.svelte'; // your app

  const layout = (layout: Layout) =>
    layout
      .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
      .add('panel:notes', { to: 'main', section: 'end' });
</script>

<PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} {layout} style="height: 100vh">
  <Panel id="notes">
    <Notes />
  </Panel>
</PDFViewer>
