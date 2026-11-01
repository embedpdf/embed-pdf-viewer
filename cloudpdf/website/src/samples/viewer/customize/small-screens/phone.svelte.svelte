<script lang="ts">
  import { PDFViewer, type Layout, type LayoutEnv } from '@cloudpdf/viewer-svelte';

  import './phone.css';

  const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

  const layout = (layout: Layout, env: LayoutEnv) =>
    env.size === 'compact' ? layout.place('main', 'bottom') : layout;
</script>

<div class="phone">
  <PDFViewer src={welcome} {layout} style="height: 100%" />
</div>
