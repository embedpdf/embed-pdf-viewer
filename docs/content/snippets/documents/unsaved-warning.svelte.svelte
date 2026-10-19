<script lang="ts">
  import { useDocument } from '@embedpdf/svelte/runtime';

  const doc = useDocument();

  $effect(() => {
    if (!doc.hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
</script>

{#if doc.hasUnsavedChanges}
  <span>Unsaved changes</span>
{/if}
