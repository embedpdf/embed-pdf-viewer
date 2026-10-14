<script lang="ts">
  import { useAnnotation, useAnnotationSettings } from '@embedpdf/svelte/annotation';

  const ACCENTS = ['#054fb3', '#e91e63', '#0f6e56'];

  let { own = $bindable() }: { own: boolean } = $props();

  const annotation = useAnnotation();
  const chrome = useAnnotationSettings((settings) => settings.chrome);
</script>

<div class="toolbar">
  <div class="swatches" role="group" aria-label="Accent">
    {#each ACCENTS as accent (accent)}
      <button
        type="button"
        class="swatch"
        aria-label={accent}
        aria-pressed={chrome.current.accent === accent}
        style:background={accent}
        onclick={() => annotation.updateSettings({ chrome: { accent } })}
      ></button>
    {/each}
  </div>
  <label class="check">
    <input
      type="checkbox"
      checked={chrome.current.outline.style === 'dashed'}
      onchange={(event) =>
        annotation.updateSettings({
          chrome: { outline: { style: event.currentTarget.checked ? 'dashed' : 'solid' } },
        })}
    />
    Dashed outline
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={chrome.current.handles.shape === 'circle'}
      onchange={(event) =>
        annotation.updateSettings({
          chrome: { handles: { shape: event.currentTarget.checked ? 'circle' : 'square' } },
        })}
    />
    Round handles
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={own} />
    Draw them myself
  </label>
  <button type="button" class="button" onclick={() => annotation.resetSettings()}>Reset</button>
</div>
