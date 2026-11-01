<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const article = '/pdfs/article.pdf';

  const config: ViewerConfig = {
    plugins: {
      annotation: {
        tools: [
          { id: 'highlight', defaults: { color: '#fde047', opacity: 0.4 } },
          { id: 'ink', defaults: { color: '#1d4ed8', strokeWidth: 2 } },
        ],
      },
    },
  };
</script>

<PDFViewer src={article} {...config} style="height: 100%" />
