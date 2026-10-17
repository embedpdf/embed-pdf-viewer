<!--
  Command shortcuts bound to an element: `useCommandShortcuts({ target })` with the element from
  `bind:this`, and every command that runs reported to `ran`.
-->
<script lang="ts">
  import { useCommandShortcuts, useCommandsEvent } from '../../src/commands';

  let { ran }: { ran: (event: { commandId: string }) => void } = $props();

  let area: HTMLDivElement | undefined = $state();
  useCommandShortcuts({ isMac: false, target: () => area });
  useCommandsEvent(
    (commands) => commands.onExecuted,
    (event) => ran(event),
  );
</script>

<div bind:this={area} data-testid="area" tabindex="-1"></div>
