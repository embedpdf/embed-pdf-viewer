<script lang="ts">
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  function onready(registry: unknown) {
    console.log('PDF viewer ready!', registry);
  }
</script>

<PDFViewer
  config={{ src: 'https://snippet.embedpdf.com/ebook.pdf' }}
  style="height: 500px"
  {onready}
/>
