<script lang="ts">
  import { useSelectionCapability } from '../hooks/use-selection.svelte';

  const selectionCapability = useSelectionCapability();

  $effect(() => {
    if (!selectionCapability.provides) return;

    return selectionCapability.provides.onCopyToClipboard((text) => {
      navigator.clipboard.writeText(text).catch((err) => {
        console.error('Failed to copy text to clipboard:', err);
      });
    });
  });
</script>

<!-- This component renders nothing to the DOM -->
