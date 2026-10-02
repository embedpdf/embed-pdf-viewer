<script lang="ts">
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { engine } from './pdf';

  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];
</script>

<Viewer {engine} {plugins}>
  <Stage>
    <RenderLayer />
    <LinkLayer />
  </Stage>
</Viewer>
