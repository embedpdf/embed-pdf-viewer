<script lang="ts">
  import {
    useStage,
    useStageSettings,
    type FlowMode,
    type LayoutKind,
    type SpreadMode,
  } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const settings = useStageSettings();
</script>

<div class="toolbar">
  <label class="label">
    Flow
    <select
      class="select"
      value={settings.flow}
      onchange={(event) => stage.updateSettings({ flow: event.currentTarget.value as FlowMode })}
    >
      <option value="continuous">continuous</option>
      <option value="paged">paged</option>
    </select>
  </label>
  <label class="label">
    Layout
    <select
      class="select"
      value={settings.layout}
      onchange={(event) =>
        stage.updateSettings({ layout: event.currentTarget.value as LayoutKind })}
    >
      <option value="vertical">vertical</option>
      <option value="horizontal">horizontal</option>
      <option value="grid">grid</option>
    </select>
  </label>
  <label class="label">
    Spread
    <select
      class="select"
      value={settings.spread}
      onchange={(event) =>
        stage.updateSettings({ spread: event.currentTarget.value as SpreadMode })}
    >
      <option value="none">none</option>
      <option value="odd">odd</option>
      <option value="even">even</option>
    </select>
  </label>
  <div class="pager">
    <button type="button" class="button" aria-label="Previous" onclick={() => stage.previousPage()}>
      ‹
    </button>
    <button type="button" class="button" aria-label="Next" onclick={() => stage.nextPage()}>
      ›
    </button>
  </div>
</div>
