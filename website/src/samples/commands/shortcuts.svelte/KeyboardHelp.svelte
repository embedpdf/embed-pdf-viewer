<!-- The sheet lists every shortcut, and shows the last command a key ran. -->
<script lang="ts">
  import { useCommands, useCommandsEvent } from '@embedpdf/svelte/commands';
  import ShortcutRow from './ShortcutRow.svelte';

  const commands = useCommands();
  let last: string | null = $state(null);

  useCommandsEvent(
    (commands) => commands.onExecuted,
    ({ commandId }) => (last = commands.resolveCommand(commandId)?.label ?? commandId),
  );
</script>

<aside class="sheet">
  <p class="status">
    {last ? `Ran: ${last}` : 'Click the viewer, then press a key, such as → for the next page'}
  </p>
  <ul class="rows">
    {#each commands.listShortcuts() as { commandId, shortcut } (`${commandId} ${shortcut}`)}
      <ShortcutRow id={commandId} {shortcut} />
    {/each}
  </ul>
</aside>
