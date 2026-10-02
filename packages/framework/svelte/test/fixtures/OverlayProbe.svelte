<!-- Overlay content that reads the Stage it's in, and an anchored badge on page 1. -->
<script lang="ts">
  import { toPageRef } from '@embedpdf/core';
  import { Anchored } from '../../src/anchored';
  import { useStageState } from '../../src/stage';

  const state = useStageState();
</script>

<output class="overlay" data-pages={state.pageCount}></output>
<Anchored anchor={{ page: toPageRef(1), bounds: { x: 10, y: 10, width: 20, height: 20 } }} pinned>
  <span class="badge">✓</span>
</Anchored>
