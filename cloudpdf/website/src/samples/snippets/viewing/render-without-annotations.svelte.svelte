<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
</script>

<Stage>
  <RenderLayer annotations={false} />
</Stage>
