<script lang="ts">
  import { usePan } from '@embedpdf/plugin-pan/svelte';
  import { HandIcon } from './icons';
  import { ToolbarButton } from './ui';

  interface PanToggleProps {
    documentId: string;
  }

  let { documentId }: PanToggleProps = $props();

  const pan = usePan(() => documentId);
</script>

{#if pan.provides}
  <ToolbarButton
    onclick={pan.provides.togglePan}
    isActive={pan.isPanning}
    aria-label="Toggle Pan"
    title="Pan (hand)"
  >
    <HandIcon class="h-4 w-4" title="Pan" />
  </ToolbarButton>
{/if}
