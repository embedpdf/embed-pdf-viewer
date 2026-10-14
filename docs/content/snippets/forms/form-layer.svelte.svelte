<script lang="ts">
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { engine } from './pdf';

  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];
</script>

<Viewer {engine} {plugins}>
  <Stage>
    <RenderLayer />
    <FormLayer />
  </Stage>
</Viewer>
