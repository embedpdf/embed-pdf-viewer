<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  useAnnotationEvent(
    (annotation) => annotation.onCreated,
    ({ annotation, origin }) => {
      console.log(`${annotation.author} added a ${annotation.subtype}`);
    },
  );
</script>
