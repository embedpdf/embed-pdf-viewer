<script lang="ts">
  import { AnnotationLayer } from '@embedpdf/svelte/annotation';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
</script>

<Stage>
  {#snippet page()}
    <RenderLayer annotations={false} />
    <AnnotationLayer />
  {/snippet}
</Stage>
