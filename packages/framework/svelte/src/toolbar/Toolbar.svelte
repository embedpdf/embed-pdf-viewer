<!--
  <Toolbar>: measures what fits and makes room, and you draw every part.

    1. A hidden measurement layer renders every unit in every variant (and the folded groups and
       the "More" button), each watched with `observeLength` from @embedpdf/web along the toolbar
       (widths, or heights when it is vertical), so a new language, a font loading, browser zoom
       and your CSS all re-measure on their own (`createToolbarLengths`).
    2. core-ui's `solve()` gives each unit a variant, a folded group or the "More" menu
       (`layoutToolbar` turns that into parts).
    3. The live row draws the parts; the "More" menu is derived from what didn't fit
       (`projectOverflow`), never written by hand.

  The toolbar is one tab stop with arrow keys along it (`attachToolbarFocus`), and its default
  menus take the menu keys (`attachMenuKeys`). Every part is a snippet with a plain default:
  `command`, `custom`, `collapsed`, `groupTrigger`, `separator`, `overflowTrigger` and
  `overflowMenu`. The defaults' colors come from the `--epdf-toolbar-*` CSS variables only.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { layoutToolbar, normalizeBar, type LiveSection } from '@embedpdf/core-ui';
  // The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
  import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
  import { unregisteredCommand } from '@embedpdf/plugin-commands/contract';
  import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
  import {
    TOOLBAR_ITEM_ATTRIBUTE,
    attachToolbarFocus,
    createToolbarLengths,
    observeContentLength,
    toolbarMeasureKey,
    type RovingFocus,
  } from '@embedpdf/web';
  import { useKernelBinding } from '../runtime/binding.svelte';
  import { useCapability, useDocumentId } from '../runtime/readers.svelte';
  import DefaultCollapsed from './DefaultCollapsed.svelte';
  import DefaultCommand from './DefaultCommand.svelte';
  import DefaultGroupTrigger from './DefaultGroupTrigger.svelte';
  import DefaultOverflowMenu from './DefaultOverflowMenu.svelte';
  import DefaultOverflowTrigger from './DefaultOverflowTrigger.svelte';
  import Measured from './Measured.svelte';
  import NativeSlotSocket from './NativeSlotSocket.svelte';
  import type { ToolbarProps } from './props';
  import type { OverflowMenuView, ToolbarPart } from './views';

  let {
    bar,
    orientation = 'horizontal',
    gap = 8,
    separatorWidth = 1,
    'aria-label': ariaLabel,
    class: className,
    style,
    command,
    custom,
    collapsed,
    groupTrigger,
    separator,
    overflowTrigger,
    overflowMenu,
  }: ToolbarProps = $props();

  const binding = useKernelBinding();
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const vertical = $derived(orientation === 'vertical');

  // ── measuring ──────────────────────────────────────────────────────────────

  let container: HTMLDivElement | undefined = $state();
  let containerLength = $state(0);
  $effect(() => {
    const element = container;
    const along = orientation;
    if (!element) return;
    return untrack(() =>
      observeContentLength(element, along, (length) => (containerLength = length)),
    );
  });

  // A length that changed by more than half a pixel fits (and draws) again. Untracked: a report
  // can come from an effect, which must not run again because the count moved.
  const lengths = createToolbarLengths();
  let measured = $state(0);
  function report(key: string, length: number) {
    untrack(() => {
      if (lengths.report(orientation, key, length)) measured += 1;
    });
  }

  // ── the fit ────────────────────────────────────────────────────────────────

  const normalized = $derived(normalizeBar(bar));

  const resolve = (id: string): ResolvedCommand | null =>
    commands.resolveCommand(id, documentId.current ?? undefined);
  const execute = (id: string): void =>
    void commands.execute(id, { documentId: documentId.current ?? undefined });

  // Command state is derived on read, so this runs again on every kernel change: labels, `active`
  // and `visible` (and with them the measurement layer) stay live. A toolbar is a few dozen
  // items, so drawing it again on each change is the simple, correct baseline.
  const layout = $derived.by(() => {
    binding.track();
    void measured;
    return layoutToolbar({
      bar: normalized,
      resolve,
      unregistered: unregisteredCommand,
      execute,
      menuTarget: (id) => commands.getMenuTarget(id),
      metrics: lengths.metrics(orientation, gap, separatorWidth),
      measureKey: toolbarMeasureKey,
      containerLength,
      orientation,
    });
  });

  // ── the "More" menu ────────────────────────────────────────────────────────

  let overflowOpen = $state(false);
  const hasOverflow = $derived(layout.hasOverflow);
  $effect(() => {
    if (!hasOverflow) overflowOpen = false;
  });
  const toggleOverflow = () => (overflowOpen = !overflowOpen);
  const noop = () => {};

  const overflowView: OverflowMenuView = $derived({
    sections: layout.overflow,
    isOpen: overflowOpen,
    close: () => (overflowOpen = false),
    resolve,
    execute,
  });

  // ── the keyboard ───────────────────────────────────────────────────────────

  // One tab stop, and arrow keys along the toolbar. The handle is no state: nothing draws from it.
  const keyboard: { focus: RovingFocus | null } = { focus: null };
  $effect(() => {
    const element = container;
    const along = orientation;
    if (!element) return;
    return untrack(() => {
      const focus = attachToolbarFocus(element, along);
      keyboard.focus = focus;
      return () => {
        focus.detach();
        keyboard.focus = null;
      };
    });
  });
  // Any draw can add, remove or disable an item, so the tab stop is checked after each one: a new
  // fit, the "More" menu, or snippets of yours that draw the parts. An effect runs after the DOM
  // it follows is updated.
  $effect(() => {
    void [layout, overflowOpen, command, custom, collapsed, groupTrigger, overflowTrigger];
    untrack(() => keyboard.focus?.refresh());
  });

  // ── layout ─────────────────────────────────────────────────────────────────

  /**
   * The sections run along the toolbar. The center one carries auto margins: it centers in the
   * space the other two leave, and gives way before anything overlaps. The toolbar itself has no
   * gap, so what the fit says fits, fits. Sections never grow or shrink: fitting is the solver's
   * job, not flexbox's.
   */
  const sectionStyle = (name: LiveSection['name']) =>
    `display: flex; flex-direction: ${vertical ? 'column' : 'row'}; align-items: center; ` +
    `gap: ${gap}px; flex: 0 0 auto;` +
    (name !== 'center'
      ? ''
      : vertical
        ? ' margin-top: auto; margin-bottom: auto;'
        : ' margin-left: auto; margin-right: auto;');

  /** The default separator: a 1px line across the toolbar, flat in a vertical one. */
  const separatorStyle = $derived(
    `${vertical ? 'height' : 'width'}: 1px; align-self: stretch; background: currentColor; ` +
      'opacity: 0.2',
  );

  /** The toolbar runs along its orientation; a `style` of yours comes after. */
  const rootStyle = $derived(
    `position: relative; display: flex; flex-direction: ${vertical ? 'column' : 'row'}; ` +
      `align-items: center; ${style ?? ''}`,
  );

  /** Marks the element around each item of the live row: its first focusable element is a stop. */
  const TOOLBAR_ITEM = { [TOOLBAR_ITEM_ATTRIBUTE]: '' };

  /**
   * The hidden measurement layer: a row for a horizontal toolbar, a column for a vertical one, and
   * no height either way, so it never adds to the page. A column keeps each item at its own
   * width, so no text wraps and changes the heights it reports.
   */
  const measureLayerStyle = $derived(
    'position: absolute; left: 0; top: 0; height: 0; overflow: hidden; visibility: hidden; ' +
      'pointer-events: none; display: flex; white-space: nowrap;' +
      (vertical ? ' flex-direction: column; align-items: flex-start;' : ''),
  );
</script>

{#snippet commandButton(item: ResolvedCommand, variant: string, run: () => void)}
  {#if command}
    {@render command(item, variant, run)}
  {:else}
    <DefaultCommand command={item} {run} />
  {/if}
{/snippet}

{#snippet part(item: ToolbarPart, layer: 'live' | 'measure')}
  {#if item.kind === 'command'}
    {@render commandButton(item.command, item.variant, item.run)}
  {:else if item.kind === 'custom'}
    {#if custom}
      {@render custom(item.name, item.variant, {
        layer,
        measure: (length) => report(item.measureKey, length),
      })}
    {:else}
      <NativeSlotSocket
        name={item.name}
        {orientation}
        onLength={(length) => report(item.measureKey, length)}
      >
        {#if item.terminal}
          {@render commandButton(item.terminal, 'icon', item.runTerminal)}
        {/if}
      </NativeSlotSocket>
    {/if}
  {:else if item.kind === 'collapsed'}
    {#if collapsed}
      {@render collapsed(item.view)}
    {:else}
      <DefaultCollapsed view={item.view} {orientation} />
    {/if}
  {:else if groupTrigger}
    {@render groupTrigger(item.view)}
  {:else}
    <DefaultGroupTrigger view={item.view} {orientation} />
  {/if}
{/snippet}

{#snippet moreButton(isOpen: boolean, toggle: () => void)}
  {#if overflowTrigger}
    {@render overflowTrigger(isOpen, toggle)}
  {:else}
    <DefaultOverflowTrigger {isOpen} {toggle} />
  {/if}
{/snippet}

<div
  bind:this={container}
  role="toolbar"
  aria-orientation={orientation}
  aria-label={ariaLabel}
  class={className}
  style={rootStyle}
>
  {#each layout.sections as section (section.name)}
    <div style={sectionStyle(section.name)}>
      {#each section.groups as group, index (group.id)}
        {#if index > 0}
          {#if separator}
            {@render separator()}
          {:else}
            <span style={separatorStyle}></span>
          {/if}
        {/if}
        {#each group.parts as item (item.key)}
          <!-- The element around an item adds no box: the item lays out as the section's child. -->
          <span {...TOOLBAR_ITEM} style="display: contents">{@render part(item, 'live')}</span>
        {/each}
      {/each}
      {#if section.name === 'end' && layout.hasOverflow}
        <span {...TOOLBAR_ITEM} style="position: relative; display: inline-flex">
          {@render moreButton(overflowOpen, toggleOverflow)}
          {#if overflowMenu}
            {@render overflowMenu(overflowView)}
          {:else}
            <DefaultOverflowMenu view={overflowView} {orientation} />
          {/if}
        </span>
      {/if}
    </div>
  {/each}

  <!-- The measurement layer: hidden, inert and observed. Text reflow (a language, a font,
       browser zoom) fires the observers; no code handles it. -->
  <div aria-hidden="true" inert style={measureLayerStyle}>
    {#each layout.measured as measuredPart (measuredPart.measureKey)}
      <!-- A custom item without a `custom` snippet is a socket, measured where it renders: a
           second <slot> of its name here would take the projected children from the row. One
           whose snippet draws nothing here is measured where it renders too, by `ctx.measure`. -->
      {#if measuredPart.kind !== 'custom' || custom}
        <Measured
          {orientation}
          onlyWhenDrawn={measuredPart.kind === 'custom'}
          onLength={(length) => report(measuredPart.measureKey, length)}
        >
          {@render part(measuredPart, 'measure')}
        </Measured>
      {/if}
    {/each}
    <Measured
      {orientation}
      onLength={(length) => report(toolbarMeasureKey.overflowTrigger, length)}
    >
      {@render moreButton(false, noop)}
    </Measured>
  </div>
</div>
