<!-- The same calls style the selected words while typing, and the whole box otherwise. -->
<script lang="ts">
  import { useAnnotation, useAnnotationProperties } from '@embedpdf/svelte/annotation';

  type Format = 'bold' | 'italic' | 'underline';
  const FORMATS: readonly Format[] = ['bold', 'italic', 'underline'];

  const annotation = useAnnotation();
  const panel = useAnnotationProperties();
  const hasText = $derived(
    panel.current.properties.some((property) => property.control === 'textFormat'),
  );
  const large = $derived(panel.current.values.fontSize === 24);
  // On when every selected word has it; `mixed` lists what the words disagree on.
  const isOn = (format: Format) =>
    panel.current.values[format] === true && !panel.current.mixed.includes(format);
</script>

<div class="toolbar">
  {#each FORMATS as format (format)}
    <button
      type="button"
      class="button {format}"
      aria-pressed={isOn(format)}
      disabled={!hasText}
      onclick={() => annotation.text.toggleFormat(format)}
    >
      {format[0]!.toUpperCase()}
    </button>
  {/each}
  <button
    type="button"
    class="button"
    disabled={!hasText}
    onclick={() => annotation.selection.update({ fontColor: '#c00000' })}
  >
    Red
  </button>
  <button
    type="button"
    class="button"
    disabled={!hasText}
    onclick={() => annotation.selection.update({ fontSize: large ? 16 : 24 })}
  >
    {large ? '16 pt' : '24 pt'}
  </button>
  <p class="hint">Ctrl or Cmd with B, I or U works while you type</p>
</div>
