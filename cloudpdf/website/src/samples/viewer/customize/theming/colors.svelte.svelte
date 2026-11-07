<script lang="ts">
  import { PDFViewer, type ThemeConfig } from '@cloudpdf/viewer-svelte';

  import './colors.css';

  const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

  // What both modes share, then the colors of each.
  const brand: ThemeConfig = {
    accent: '#0f6e56',
    tokens: { radius: '2px' },
    light: { surface: '#fbfaf7', canvas: '#ece8df' },
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
