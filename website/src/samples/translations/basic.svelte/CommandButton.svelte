<script lang="ts">
  import { useCommand } from '@embedpdf/svelte/commands';

  let { id }: { id: string } = $props();

  const command = useCommand(() => id);
</script>

{#if command.current?.visible}
  {@const cmd = command.current}
  <button type="button" class="button" disabled={!cmd.enabled} onclick={cmd.run}>
    {cmd.label}
  </button>
{/if}
