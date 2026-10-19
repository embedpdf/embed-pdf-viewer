<script lang="ts">
  import { useAnnotationEvent } from '@embedpdf/svelte/annotation';

  let sidebarOpen = $state(false);

  useAnnotationEvent(
    (annotation) => annotation.onSelectionChanged,
    ({ refs }) => (sidebarOpen = refs.length > 0),
  );
</script>

{#if sidebarOpen}
  <aside><!-- … --></aside>
{/if}
