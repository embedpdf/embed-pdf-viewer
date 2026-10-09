<!-- A Stage whose pages draw a `<RenderLayer>`, and with `painter` a layer that paints annotations. -->
<script lang="ts">
  import { RenderLayer } from '../../src/render';
  import { Stage } from '../../src/stage';
  import PaintsAnnotations from './PaintsAnnotations.svelte';

  let { annotations, painter = false }: { annotations?: boolean; painter?: boolean } = $props();
</script>

<Stage style="height: 600px">
  <RenderLayer {annotations} />
  {#if painter}
    <PaintsAnnotations />
  {/if}
</Stage>
