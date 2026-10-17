<script lang="ts">
  import { epdfTheme } from '@embedpdf/svelte/runtime';

  import Pages from './pages.svelte';

  let accent = $state('#e91e63');
</script>

<div class="pdf-viewer" style={epdfTheme({ accent })}>
  <input type="color" bind:value={accent} />
  <Pages />
</div>
