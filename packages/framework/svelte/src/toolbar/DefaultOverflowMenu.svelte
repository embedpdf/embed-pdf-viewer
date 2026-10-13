<!--
  The default "More" menu: a minimal popover under its button in a horizontal toolbar and beside
  it in a vertical one, one section after another. A press anywhere outside it closes it, and
  while it's open it takes the menu keys (`attachMenuKeys`): focus on its first row, the arrows,
  typeahead, Enter, and Escape back to its button. A row that opens a submenu keeps the menu
  open; every other row closes it after running.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { OverflowRow } from '@embedpdf/core-ui';
  import {
    attachMenuKeys,
    focusablesIn,
    observeOutsidePress,
    type Orientation,
  } from '@embedpdf/web';
  import type { OverflowMenuView } from './views';
  import { BORDER, SURFACE } from './paint';

  let { view, orientation }: { view: OverflowMenuView; orientation: Orientation } = $props();
  let menu = $state<HTMLElement | null>(null);

  // Whether it's open, apart from the view: the toolbar hands a new view on every change, and
  // attaching again would put focus back on the first row.
  const isOpen = $derived(view.isOpen);

  $effect(() => {
    const element = menu;
    if (!isOpen || !element) return;
    return untrack(() => {
      // The menu's parent holds its button too: a press on it is the button's own toggle.
      const container = element.parentElement ?? element;
      const trigger =
        focusablesIn(container).find((candidate) => !element.contains(candidate)) ?? null;
      const close = () => view.close();
      const stopOutside = observeOutsidePress(container, close);
      const detachKeys = attachMenuKeys(element, { trigger, close });
      return () => {
        stopOutside();
        detachKeys();
      };
    });
  });

  /** Under a horizontal toolbar's button, beside a vertical one's. */
  const placement = $derived(
    orientation === 'vertical'
      ? 'top: 0; inset-inline-start: 100%;'
      : 'top: 100%; inset-inline-end: 0;',
  );

  function choose(row: OverflowRow) {
    view.execute(row.command);
    if (row.type !== 'submenu') view.close();
  }
</script>

{#if isOpen}
  <div
    bind:this={menu}
    role="menu"
    style="position: absolute; {placement}"
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
            tabindex="-1"
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
