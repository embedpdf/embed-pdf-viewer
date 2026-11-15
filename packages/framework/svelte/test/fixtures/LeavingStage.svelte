<!-- A Stage whose pages each have a layer that reads its page as it goes away. -->
<script lang="ts">
  import { Stage } from '../../src/stage';
  import LeavingLayer from './LeavingLayer.svelte';

  let { left }: { left: { page: number; view: string; documentId: string }[] } = $props();
</script>

<Stage style="height: 600px">
  <LeavingLayer {left} />
</Stage>
