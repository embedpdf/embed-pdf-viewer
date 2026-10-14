<!-- A Stage with a `<Scrollbar>` in its overlay, and the scroll metrics read outside it. -->
<script lang="ts">
  import { Scrollbar, Stage, useScrollMetrics } from '../../src/stage';

  const metrics = useScrollMetrics();
</script>

<output class="metrics" data-top={metrics.scrollTop} data-height={metrics.scrollHeight}></output>
<Stage style="height: 600px">
  <span class="page"></span>
  {#snippet overlay()}
    <Scrollbar axis="y" autoHide={false} class="bar" thumbClass="thumb" />
  {/snippet}
</Stage>
