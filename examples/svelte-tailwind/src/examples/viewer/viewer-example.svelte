<script lang="ts">
  import { PDFViewer, type EmbedPdfContainer } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });
</script>

<div
  class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
>
  <PDFViewer
    oninit={handleInit}
    config={{
      src: 'https://snippet.embedpdf.com/ebook.pdf',
      theme: { preference: themePreference },
    }}
    style="width: 100%; height: 100%;"
  />
</div>
