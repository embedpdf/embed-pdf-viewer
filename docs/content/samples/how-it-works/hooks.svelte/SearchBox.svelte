<script lang="ts">
  import {
    useSearch,
    useSearchEvent,
    useSearchSettings,
    useSearchState,
  } from '@embedpdf/svelte/search';

  const colors = ['#ffd500', '#7dd3fc', '#86efac'];

  // The API: what search can do.
  const search = useSearch();
  // The data to show: what reads `searchState.hitCount` updates when the count changes.
  const searchState = useSearchState();
  // The settings: what reads `color.current` updates when the highlight color changes.
  const color = useSearchSettings((settings) => settings.highlight.color);
  let text = $state('PDF');
  let announcement = $state('');

  // A call to your function when something happens.
  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => (announcement = `The search finished with ${hitCount} matches.`),
  );

  $effect(() => {
    void search.search({ text });
  });
</script>

<div class="toolbar">
  <input class="field" type="search" aria-label="Search" bind:value={text} />
  <output class="readout">
    {searchState.hitCount > 0
      ? `${searchState.activeHitIndex + 1} of ${searchState.hitCount}`
      : 'No matches'}
  </output>
  <button type="button" class="button" onclick={() => search.nextHit()}>Next</button>
  {#each colors as swatch (swatch)}
    <button
      type="button"
      class="swatch"
      aria-label="Highlight in {swatch}"
      aria-pressed={color.current === swatch}
      style:background={swatch}
      onclick={() => search.updateSettings({ highlight: { color: swatch } })}
    ></button>
  {/each}
  <button type="button" class="button" onclick={() => search.resetSettings()}>Reset</button>
</div>
<p class="announcement" aria-live="polite">{announcement}</p>
