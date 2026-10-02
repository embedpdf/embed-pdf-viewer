<script lang="ts">
  import { useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotations = useAnnotationState();

  const text = $derived.by(() => {
    if (annotations.status === 'loading') return 'Loading the annotations…';
    if (annotations.selected.length > 0) {
      return `Selected: ${annotations.selected.map((a) => a.subtype).join(', ')}`;
    }
    return 'Click an annotation to select it';
  });
</script>

<div class="toolbar">
  <p class="hint">{text}</p>
</div>
