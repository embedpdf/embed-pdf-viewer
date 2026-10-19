<script lang="ts">
  import { useStage, useStageSettings, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const settings = useStageSettings();
  const state = useStageState();
  // A number grows with the zoom; { px } stays the same on screen.
  const onScreen = $derived(typeof settings.gap !== 'number');
  const gapSize = $derived(typeof settings.gap === 'number' ? settings.gap : settings.gap.px);
</script>

<div class="toolbar">
  <label class="label">
    Padding
    <input
      class="range"
      type="range"
      min={0}
      max={64}
      value={settings.padding}
      oninput={(event) => stage.updateSettings({ padding: Number(event.currentTarget.value) })}
    />
    <output class="value">{settings.padding}</output>
  </label>
  <label class="label">
    Gap
    <input
      class="range"
      type="range"
      min={0}
      max={64}
      value={gapSize}
      oninput={(event) => {
        const size = Number(event.currentTarget.value);
        stage.updateSettings({ gap: onScreen ? { px: size } : size });
      }}
    />
    <output class="value">{gapSize}</output>
  </label>
  <div class="segmented" role="group" aria-label="Gap unit">
    <button
      type="button"
      aria-pressed={onScreen}
      onclick={() => stage.updateSettings({ gap: { px: gapSize } })}
    >
      Screen pixels
    </button>
    <button
      type="button"
      aria-pressed={!onScreen}
      onclick={() => stage.updateSettings({ gap: gapSize })}
    >
      Grows with zoom
    </button>
  </div>
  <div class="zoom">
    <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
      −
    </button>
    <output class="readout">{Math.round(state.zoomLevel * 100)}%</output>
    <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
      +
    </button>
  </div>
</div>
