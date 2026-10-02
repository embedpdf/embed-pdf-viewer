<!-- One row of the sheet: the key, and what it does. A command that can't run now is greyed out. -->
<script lang="ts">
  import { formatShortcut, useCommand } from '@embedpdf/svelte/commands';

  let { id, shortcut }: { id: string; shortcut: string } = $props();

  const command = useCommand(() => id);
</script>

{#if command.current?.visible}
  <li class="row" data-disabled={!command.current.enabled || undefined}>
    <kbd class="key">{formatShortcut(shortcut)}</kbd>
    <span>{command.current.label}</span>
  </li>
{/if}
