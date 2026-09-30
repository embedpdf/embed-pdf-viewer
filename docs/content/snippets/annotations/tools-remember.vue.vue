<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

useAnnotationEvent(
  (annotation) => annotation.tools.onDefaultsChanged,
  ({ toolId, defaults }) => {
    localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
  },
);
</script>
