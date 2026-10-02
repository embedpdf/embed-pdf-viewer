<!--
  The default command button: the command's label in every variant (icons are the app's), pressed
  when the command is active.
-->
<script lang="ts">
  import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
  import { ACTIVE, BORDER } from './paint';

  let { command, run }: { command: ResolvedCommand; run: () => void } = $props();
</script>

<button
  type="button"
  onclick={run}
  disabled={!command.enabled}
  aria-pressed={command.active || undefined}
  aria-haspopup={command.menu ? 'menu' : undefined}
  title={command.label}
  style:display="inline-flex"
  style:align-items="center"
  style:gap="4px"
  style:padding="4px 8px"
  style:white-space="nowrap"
  style:color="inherit"
  style:font="inherit"
  style:background={command.active ? ACTIVE : 'transparent'}
  style:border="1px solid {BORDER}"
  style:border-radius="4px"
  style:cursor={command.enabled ? 'pointer' : 'default'}
  style:opacity={command.enabled ? 1 : 0.4}
>
  {command.label}
</button>
