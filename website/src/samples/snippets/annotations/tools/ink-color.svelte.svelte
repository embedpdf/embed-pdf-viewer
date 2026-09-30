<script lang="ts">
  import { useAnnotation, useAnnotationDefaults } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const defaults = useAnnotationDefaults('ink');
</script>

<input
  type="color"
  value={defaults.current.color}
  oninput={(event) => annotation.tools.updateDefaults('ink', { color: event.currentTarget.value })}
/>
