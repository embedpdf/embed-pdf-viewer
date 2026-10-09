<script lang="ts">
  import { useAnnotationState } from '@embedpdf/svelte/annotation';

  const state = useAnnotationState(); // state.selected: the selected annotations
</script>

<p>{state.selected.length} selected</p>
