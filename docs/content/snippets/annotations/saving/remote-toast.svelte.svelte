<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';
  import { toast } from './toast'; // your own

  useAnnotationEvent(
    (annotation) => annotation.onUpdated,
    ({ annotation, origin }) => {
      if (origin.kind === 'remote') toast(`${annotation.author} changed a comment`);
    },
  );
</script>
