<script lang="ts">
  import { PDFViewer, type ThemeConfig } from '@embedpdf/viewer-svelte';

  import './colors.css';

  // [!doc-source welcome]
  const welcome = '/pdfs/welcome.pdf';
  // [!/doc-source]

  // Your colors for both modes, and what's different in dark.
  const brand: ThemeConfig = {
    accent: '#0f6e56',
    tokens: { surface: '#fbfaf7', canvas: '#ece8df', radius: '2px' },
    dark: {
      accent: '#4fbf98',
      surface: '#16201c',
      'surface-raised': '#1d2a25',
      canvas: '#0c1210',
      hover: '#24332d',
    },
  };

  let dark = $state(false);
</script>

<div class="app" class:dark>
  <header class="bar">
    <label>
      <input type="checkbox" bind:checked={dark} />
      Dark
    </label>
  </header>
  <PDFViewer
    class="viewer"
    src={welcome}
    theme={{ ...brand, preference: dark ? 'dark' : 'light' }}
  />
</div>
