<!-- One button, drawn from its command: the label, the shortcut, and whether it can run now. -->
<script lang="ts">
  import { useCommand } from '@embedpdf/svelte/commands';

  let { id }: { id: string } = $props();

  const command = useCommand(() => id);
</script>

{#if command.current?.visible}
  {@const cmd = command.current}
  <button
    type="button"
    class="button"
    title={cmd.label}
    disabled={!cmd.enabled}
    aria-pressed={cmd.active}
    onclick={cmd.run}
  >
    {cmd.label}
    {#if cmd.shortcut}<kbd class="shortcut">{cmd.shortcut}</kbd>{/if}
  </button>
{/if}
