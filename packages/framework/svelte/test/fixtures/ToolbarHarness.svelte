<!--
  A `<Toolbar>` for tests: `drawCommands` draws commands with a `command` snippet (a button that
  says its variant), `drawCustom` draws custom items with a `custom` snippet; left out, the
  toolbar's defaults draw them.
-->
<script lang="ts">
  import { Toolbar, type BarSchema } from '../../src/toolbar';

  let {
    bar,
    drawCommands = false,
    drawCustom = false,
  }: { bar: BarSchema; drawCommands?: boolean; drawCustom?: boolean } = $props();
</script>

{#snippet button(command: { id: string; label: string }, variant: string, run: () => void)}
  <button type="button" data-command={command.id} data-variant={variant} onclick={run}>
    {command.label}
  </button>
{/snippet}

{#snippet item(name: string, variant: string, ctx: { layer: 'live' | 'measure' })}
  <span data-custom={name} data-variant={variant} data-layer={ctx.layer}>{name}</span>
{/snippet}

<Toolbar {bar} command={drawCommands ? button : undefined} custom={drawCustom ? item : undefined} />
