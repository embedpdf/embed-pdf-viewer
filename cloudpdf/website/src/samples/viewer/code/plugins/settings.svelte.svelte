<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const links = { grant: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };

  const config: ViewerConfig = {
    plugins: {
      stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
      selection: { color: 'rgb(124 58 237 / 0.3)' },
    },
  };
</script>

<PDFViewer src={links} {...config} style="height: 100%" />
