<script lang="ts">
  import { useSearch, useSearchSettings } from '@embedpdf/svelte/search';

  // Each pair: every match, and the active one.
  const COLORS = [
    { name: 'Yellow', color: '#ffd500', activeColor: '#ff9632' },
    { name: 'Blue', color: '#a5d8ff', activeColor: '#4c9bff' },
    { name: 'Green', color: '#b2f2bb', activeColor: '#40c057' },
    { name: 'Pink', color: '#fcc2d7', activeColor: '#f06595' },
  ];

  const search = useSearch();
  const selected = useSearchSettings((settings) => settings.highlight.color);

  // Something to highlight.
  $effect(() => {
    void search.search({ text: 'PDF' });
  });
</script>

{#each COLORS as { name, color, activeColor } (name)}
  <button
    type="button"
    class="swatch"
    aria-label={name}
    aria-pressed={selected.current === color}
    style:background="linear-gradient(135deg, {color} 50%, {activeColor} 50%)"
    onclick={() => search.updateSettings({ highlight: { color, activeColor } })}
  ></button>
{/each}
<button type="button" class="button" onclick={() => search.resetSettings()}>Reset</button>
