<!-- The pen's color and width, for the strokes that follow. -->
<script lang="ts">
  import { useAnnotation, useAnnotationDefaults } from '@embedpdf/svelte/annotation';

  const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

  const annotation = useAnnotation();
  const defaults = useAnnotationDefaults('ink');
</script>

<div class="toolbar">
  <div class="swatches" role="group" aria-label="Pen color">
    {#each COLORS as color (color)}
      <button
        type="button"
        class="swatch"
        aria-label={color}
        aria-pressed={defaults.current.color === color}
        style:background={color}
        onclick={() => annotation.tools.updateDefaults('ink', { color })}
      ></button>
    {/each}
  </div>
  <input
    type="color"
    class="color"
    aria-label="Any color"
    value={defaults.current.color ?? '#000000'}
    oninput={(event) =>
      annotation.tools.updateDefaults('ink', { color: event.currentTarget.value })}
  />
  <label class="range">
    Width
    <input
      type="range"
      min={1}
      max={12}
      value={defaults.current.strokeWidth ?? 1}
      oninput={(event) =>
        annotation.tools.updateDefaults('ink', { strokeWidth: Number(event.currentTarget.value) })}
    />
    <output class="readout">{defaults.current.strokeWidth} pt</output>
  </label>
</div>
