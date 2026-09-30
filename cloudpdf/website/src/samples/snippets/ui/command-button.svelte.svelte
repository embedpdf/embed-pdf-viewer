<script lang="ts">
  import { useCommand } from '@embedpdf/svelte/commands';
  import Icon from './Icon.svelte';

  let { id }: { id: string } = $props();
  const command = useCommand(() => id);
</script>

{#if command.current?.visible}
  {@const cmd = command.current}
  <button onclick={cmd.run} disabled={!cmd.enabled} aria-pressed={cmd.active}>
    <Icon name={cmd.icon} />
    {cmd.label}
    {#if cmd.shortcut}<kbd>{cmd.shortcut}</kbd>{/if}
  </button>
{/if}
