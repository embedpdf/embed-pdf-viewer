<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';

  import Pages from './pages.svelte';
  import { engine, plugins } from './pdf';
</script>

<Viewer {engine} {plugins} accent="#e91e63" page={{ shadow: 'none' }}>
  <Pages />
</Viewer>
