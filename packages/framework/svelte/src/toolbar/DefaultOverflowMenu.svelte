<!--
  The default "More" menu: a minimal popover under its button, one section after another. A row
  that opens a submenu keeps the menu open; every other row closes it after running.
-->
<script lang="ts">
  import type { OverflowRow } from '@embedpdf/core-ui';
  import type { OverflowMenuView } from './views';
  import { BORDER, SURFACE } from './paint';

  let { view }: { view: OverflowMenuView } = $props();

  function choose(row: OverflowRow) {
    view.execute(row.command);
    if (row.type !== 'submenu') view.close();
  }
</script>

{#if view.isOpen}
  <!-- A press anywhere outside the menu closes it; Escape is the app's to add. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div style="position: fixed; inset: 0; z-index: 40" onclick={() => view.close()}></div>
  <div
    role="menu"
    style:position="absolute"
    style:right="0"
    style:top="100%"
    style:z-index="41"
    style:min-width="200px"
    style:padding="4px"
    style:background={SURFACE}
    style:border="1px solid {BORDER}"
    style:border-radius="6px"
    style:box-shadow="0 4px 16px rgba(0,0,0,0.15)"
  >
    {#each view.sections as section, index (index)}
      {#if index > 0}
        <div style:height="1px" style:background={BORDER} style:margin="4px 0"></div>
      {/if}
      {#each section.rows as row (row.command)}
        {@const command = view.resolve(row.command)}
        {#if command}
          <button
            type="button"
            role={section.role === 'radio' ? 'menuitemradio' : 'menuitem'}
            aria-checked={section.role === 'radio' ? command.active : undefined}
            disabled={!command.enabled}
            onclick={() => choose(row)}
            style:display="flex"
            style:width="100%"
            style:align-items="center"
            style:justify-content="space-between"
            style:gap="16px"
            style:padding="6px 8px"
            style:border="none"
            style:color="inherit"
            style:font="inherit"
            style:background="transparent"
            style:cursor={command.enabled ? 'pointer' : 'default'}
            style:opacity={command.enabled ? 1 : 0.4}
            style:white-space="nowrap"
          >
            <span>{command.active && section.role === 'radio' ? '• ' : ''}{command.label}</span>
            {#if row.type === 'submenu'}<span>▸</span>{/if}
          </button>
        {/if}
      {/each}
    {/each}
  </div>
{/if}
