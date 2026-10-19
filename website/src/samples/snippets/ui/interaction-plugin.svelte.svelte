<script lang="ts">
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { engine } from './pdf';

  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar and pages -->
</Viewer>
