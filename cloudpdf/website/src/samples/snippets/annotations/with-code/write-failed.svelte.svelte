<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  import { toast } from './toast';

  useAnnotationEvent(
    (annotation) => annotation.onWriteFailed,
    ({ error }) => toast(`Couldn't save: ${error.message}`),
  );
</script>
