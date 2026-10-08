<script lang="ts">
  import { Button, useCommand } from '@embedpdf/viewer-svelte';
  import { useStageState } from '@embedpdf/svelte/stage';

  const stage = useStageState();
  const fitWidth = useCommand('zoom:fit-width');
</script>

<div class="zoom-pill">
  <Button command="zoom:out" />
  <span>{Math.round(stage.zoomLevel * 100)}%</span>
  <Button command="zoom:in" />
  <button class="chip" aria-pressed={fitWidth.current?.active} onclick={fitWidth.current?.run}>
    {fitWidth.current?.label}
  </button>
</div>
