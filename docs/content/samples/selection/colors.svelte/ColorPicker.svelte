<script lang="ts">
  import { useSelection, useSelectionSettings } from '@embedpdf/svelte/selection';

  // Each: the selected text and its handles. `null` is the viewer's accent: at 35% for the text.
  const COLORS = [
    { name: 'Accent', color: null, handles: null, swatch: '#3858e9' },
    { name: 'Yellow', color: 'rgb(250 204 21 / 0.45)', handles: '#ca8a04', swatch: '#facc15' },
    { name: 'Green', color: 'rgb(34 197 94 / 0.35)', handles: '#16a34a', swatch: '#22c55e' },
    { name: 'Pink', color: 'rgb(236 72 153 / 0.3)', handles: '#db2777', swatch: '#ec4899' },
  ];

  const selection = useSelection();
  const selected = useSelectionSettings((settings) => settings.color);
</script>

{#each COLORS as { name, color, handles, swatch } (name)}
  <button
    type="button"
    class="swatch"
    aria-label={name}
    aria-pressed={selected.current === color}
    style:background={swatch}
    onclick={() => selection.updateSettings({ color, handles: { color: handles } })}
  ></button>
{/each}
<button type="button" class="button" onclick={() => selection.resetSettings()}>Reset</button>
