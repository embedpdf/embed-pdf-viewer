<script lang="ts">
  import { AnnotationLayer } from '@embedpdf/svelte/annotation';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
</script>

<Stage>
  <RenderLayer annotations={false} />
  <AnnotationLayer />
</Stage>
