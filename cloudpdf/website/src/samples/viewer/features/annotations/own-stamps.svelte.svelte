<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const registration = { grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

  const config: ViewerConfig = {
    plugins: {
      stamp: {
        libraries: [{ id: 'marks', url: 'https://www.cloudpdf.com/pdfs/marks.pdf' }],
        quick: ['marks:Check', 'marks:Cross'],
      },
    },
  };
</script>

<PDFViewer src={registration} {...config} style="height: 100%" />
