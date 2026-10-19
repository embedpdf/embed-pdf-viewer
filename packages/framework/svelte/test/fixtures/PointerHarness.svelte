<!-- A Stage whose pages carry a `<PagePointerSource>`, and a tool cursor while `cursor` is set. -->
<script lang="ts">
  import { PagePointerSource, useToolCursor } from '../../src/interaction';
  import { Stage } from '../../src/stage';

  let { cursor }: { cursor?: string } = $props();

  useToolCursor(() => (cursor ? { toolId: 'pen', cursors: { crosshair: cursor } } : null));
</script>

<Stage style="height: 600px">
  <PagePointerSource />
</Stage>
