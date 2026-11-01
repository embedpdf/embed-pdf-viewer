<script lang="ts">
  import { PDFViewer, type Layout, type LayoutEnv } from '@embedpdf/viewer-svelte';

  import './phone.css';

  const welcome = '/pdfs/welcome.pdf';

  const layout = (layout: Layout, env: LayoutEnv) =>
    env.size === 'compact' ? layout.place('main', 'bottom') : layout;
</script>

<div class="phone">
  <PDFViewer src={welcome} {layout} style="height: 100%" />
</div>
