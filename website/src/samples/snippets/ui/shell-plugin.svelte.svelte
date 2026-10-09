<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { shellPlugin } from '@embedpdf/svelte/shell';
  import { engine } from './pdf';

  const plugins = [/* … */ shellPlugin()];
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar, panels and pages -->
</Viewer>
