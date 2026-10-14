<!-- Every change is kept for next time. -->
<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  useAnnotationEvent(
    (annotation) => annotation.tools.onDefaultsChanged,
    ({ toolId, defaults }) => {
      localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
    },
  );
</script>
