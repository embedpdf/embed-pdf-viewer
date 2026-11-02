<script lang="ts">
  import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-svelte';
  import ReviewStatus from './ReviewStatus.svelte';

  import '../status.css';

  // [!doc-source proposal]
  const proposal = '/pdfs/proposal.pdf';
  // [!/doc-source]

  let status = $state('review');

  const layout = (layout: Layout) =>
    layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<PDFViewer src={proposal} {layout} style="height: 100%">
  <ToolbarItem id="status">
    <ReviewStatus bind:status />
  </ToolbarItem>
</PDFViewer>
