<!--
  A Stage with a `<Scrollbar>` in its overlay, and the scroll metrics read outside it. The Stage
  sits in an element that listens for presses natively, as the Stage itself does.
-->
<script lang="ts">
  import { Scrollbar, Stage, useScrollMetrics } from '../../src/stage';

  let { stagePresses = [] }: { stagePresses?: Event[] } = $props();

  const metrics = useScrollMetrics();

  function pressesBelow(element: HTMLElement) {
    const record = (event: Event) => stagePresses.push(event);
    element.addEventListener('pointerdown', record);
    return () => element.removeEventListener('pointerdown', record);
  }
</script>

<output class="metrics" data-top={metrics.scrollTop} data-height={metrics.scrollHeight}></output>
<div {@attach pressesBelow}>
  <Stage style="height: 600px">
    <span class="page"></span>
    {#snippet overlay()}
      <Scrollbar axis="y" autoHide={false} class="bar" thumbClass="thumb" />
    {/snippet}
  </Stage>
</div>
