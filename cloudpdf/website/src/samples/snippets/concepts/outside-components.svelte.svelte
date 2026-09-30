<script lang="ts">
  import { Viewer, type Kernel } from '@embedpdf/svelte/runtime';
  import { SearchToken } from '@embedpdf/svelte/search';
  import { engine, plugins } from './pdf';

  function onReady(viewer: Kernel) {
    const search = viewer.capability(SearchToken);
  }
</script>

<Viewer {engine} {plugins} {onReady} />
