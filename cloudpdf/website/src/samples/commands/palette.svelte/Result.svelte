<!-- A result: its row follows the command, so it greys out the moment the command can't run. -->
<script lang="ts">
  import { useCommand } from '@embedpdf/svelte/commands';

  let { id }: { id: string } = $props();

  const command = useCommand(() => id);
</script>

{#if command.current}
  {@const cmd = command.current}
  <li>
    <button type="button" class="result" disabled={!cmd.enabled} onclick={cmd.run}>
      <span>{cmd.label}</span>
      {#if cmd.shortcut}<kbd class="shortcut">{cmd.shortcut}</kbd>{/if}
    </button>
  </li>
{/if}
