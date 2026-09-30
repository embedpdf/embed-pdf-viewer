<script lang="ts">
  import { AnnotationLayer } from '@embedpdf/svelte/annotation';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer } from '@embedpdf/svelte/search';
  import { SelectionLayer } from '@embedpdf/svelte/selection';
  import { Stage } from '@embedpdf/svelte/stage';
</script>

<Stage>
  {#snippet page()}
    <RenderLayer annotations={false} />
    <SearchLayer />
    <SelectionLayer />
    <AnnotationLayer />
  {/snippet}
</Stage>
