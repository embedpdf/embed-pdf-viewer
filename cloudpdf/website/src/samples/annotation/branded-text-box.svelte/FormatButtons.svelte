<!-- The formatting calls work on your element as they do on the built-in one. -->
<script lang="ts">
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const FORMATS = ['bold', 'italic', 'underline'] as const;

  const annotation = useAnnotation();
  const hasText = useAnnotationState((state) =>
    state.selected.some((selected) => selected.subtype === 'free-text'),
  );
</script>

<div class="toolbar">
  {#each FORMATS as format (format)}
    <button
      type="button"
      class="button {format}"
      disabled={!hasText.current}
      onclick={() => annotation.text.toggleFormat(format)}
    >
      {format[0]!.toUpperCase()}
    </button>
  {/each}
</div>
