<!-- A Stage whose pages draw a `<RenderLayer>`. -->
<script lang="ts">
  import { RenderLayer } from '../../src/render';
  import { Stage } from '../../src/stage';

  let { annotations = true }: { annotations?: boolean } = $props();
</script>

<Stage style="height: 600px">
  <RenderLayer {annotations} />
</Stage>
