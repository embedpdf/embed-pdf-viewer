<script lang="ts">
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';

  import { engine } from './setup';

  const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];
</script>

<Viewer {engine} {plugins}>
  <Stage>
    <RenderLayer />
    <AnnotationLayer />
  </Stage>
</Viewer>
