<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { localEngine } from '@embedpdf/engine';
  import { plugins } from './pdf';
</script>

<Viewer engine={() => localEngine()} {plugins} />
