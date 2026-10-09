<script lang="ts">
  import { useRender, useRenderSettings } from '@embedpdf/svelte/render';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const BUDGETS = [320, 640, 1280];

  const render = useRender();
  const stage = useStage();
  const settings = useRenderSettings();
  const tiles = $derived(settings.tiles !== false);
  const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<div class="toolbar">
  <span class="label">Budget</span>
  <div class="segmented" role="group" aria-label="Whole-page budget">
    {#each BUDGETS as width (width)}
      <button
        type="button"
        aria-pressed={width === settings.fullPage.maxWidth}
        onclick={() => render.updateSettings({ fullPage: { maxWidth: width } })}
      >
        {width} px
      </button>
    {/each}
  </div>
  <span class="label">Tiles</span>
  <div class="segmented" role="group" aria-label="Tiles">
    <button
      type="button"
      aria-pressed={tiles}
      onclick={() => render.updateSettings({ tiles: { size: 512 } })}
    >
      On
    </button>
    <button
      type="button"
      aria-pressed={!tiles}
      onclick={() => render.updateSettings({ tiles: false })}
    >
      Off
    </button>
  </div>
  <div class="zoom">
    <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
      −
    </button>
    <output class="readout">{Math.round(zoomLevel.current * 100)}%</output>
    <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
      +
    </button>
  </div>
</div>
