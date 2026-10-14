<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  import { saveStyle } from './styles';

  useAnnotationEvent(
    (annotation) => annotation.tools.onDefaultsChanged,
    ({ toolId, defaults }) => saveStyle(toolId, defaults),
  );
</script>
