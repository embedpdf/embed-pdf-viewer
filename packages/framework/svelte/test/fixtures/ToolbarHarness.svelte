<!--
  A `<Toolbar>` for tests: `drawCommands` draws commands with a `command` snippet (a button that
  says its variant), `drawCustom` draws custom items with a `custom` snippet (`'field'`: a field
  and a button in each); left out, the toolbar's defaults draw them. `orientation`, `label` (its
  `aria-label`) and `style` go to the toolbar.
-->
<script lang="ts">
  import { Toolbar, type BarSchema } from '../../src/toolbar';

  let {
    bar,
    drawCommands = false,
    drawCustom = false,
    orientation,
    label,
    style,
  }: {
    bar: BarSchema;
    drawCommands?: boolean;
    drawCustom?: boolean | 'field';
    orientation?: 'horizontal' | 'vertical';
    label?: string;
    style?: string;
  } = $props();
</script>

{#snippet button(command: { id: string; label: string }, variant: string, run: () => void)}
  <button type="button" data-command={command.id} data-variant={variant} onclick={run}>
    {command.label}
  </button>
{/snippet}

{#snippet item(name: string, variant: string, ctx: { layer: 'live' | 'measure' })}
  {#if drawCustom === 'field'}
    <span data-custom={name}>
      <input aria-label="Page" />
      <button type="button">Go</button>
    </span>
  {:else}
    <span data-custom={name} data-variant={variant} data-layer={ctx.layer}>{name}</span>
  {/if}
{/snippet}

<Toolbar
  {bar}
  {orientation}
  aria-label={label}
  {style}
  command={drawCommands ? button : undefined}
  custom={drawCustom ? item : undefined}
/>
