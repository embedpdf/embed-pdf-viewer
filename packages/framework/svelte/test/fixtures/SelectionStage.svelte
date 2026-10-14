<!-- A Stage with the selection highlight on its pages and the selection handles in its overlay. -->
<script lang="ts">
  import { SelectionHandles, SelectionLayer } from '../../src/selection';
  import { Stage } from '../../src/stage';
</script>

<Stage class="stage" style="height: 600px">
  <SelectionLayer />
  {#snippet overlay()}
    <SelectionHandles />
  {/snippet}
</Stage>
