<!--
  A 400 × 300 surface that shows pages where their rects say, one camera frame per `frame`
  value, with one `<Anchored>` badge; `renders` counts how often its content is created or its
  position computed.
-->
<script lang="ts">
  import { Anchored, setProjectorBinding, setShownPages } from '../../src/anchored';
  import type { AnchoredProps, ShownPages, ViewProjector } from '../../src/anchored';
  import Counted from './Counted.svelte';

  let {
    frame,
    shown,
    anchor,
    renders,
  }: {
    frame: number;
    shown: ShownPages;
    anchor: AnchoredProps['anchor'];
    renders: unknown[];
  } = $props();

  const projector: ViewProjector = {
    space: 'overlay',
    toScreen: (_page, rect) => rect,
    toScreenPoint: (_page, at) => at,
    viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
    view: () => ({ x: 0, y: 0, width: 400, height: 300 }),
  };
  // A new binding each frame, as the Stage's camera gives one.
  const binding = $derived({ projector, revision: frame });
  setProjectorBinding(() => binding);
  setShownPages(() => shown);
</script>

<div style="position: relative; width: 400px; height: 300px">
  <Anchored {anchor} pinned>
    <Counted {renders} />
    <span class="badge">✓</span>
  </Anchored>
</div>
