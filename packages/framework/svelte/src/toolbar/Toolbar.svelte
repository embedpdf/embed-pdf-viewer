<!--
  <Toolbar>: measures what fits and makes room, and you draw every part.

    1. A hidden measurement layer renders every unit in every variant (and the folded groups and
       the "More" button), each watched with `observeWidth` from @embedpdf/web, so a new
       language, a font loading, browser zoom and your CSS all re-measure on their own
       (`createToolbarWidths`).
    2. core-ui's `solve()` gives each unit a variant, a folded group or the "More" menu
       (`layoutToolbar` turns that into parts).
    3. The live row draws the parts; the "More" menu is derived from what didn't fit
       (`projectOverflow`), never written by hand.

  Every part is a snippet with a plain default: `command`, `custom`, `collapsed`, `groupTrigger`,
  `separator`, `overflowTrigger` and `overflowMenu`. The defaults' colors come from the
  `--epdf-toolbar-*` CSS variables only.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { layoutToolbar, normalizeBar, type LiveSection } from '@embedpdf/core-ui';
  // The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
  import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
  import { unregisteredCommand } from '@embedpdf/plugin-commands/contract';
  import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
  import { createToolbarWidths, observeContentWidth, toolbarMeasureKey } from '@embedpdf/web';
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
    gap = 8,
    separatorWidth = 1,
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

  // ── measuring ──────────────────────────────────────────────────────────────

  let container: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);
  $effect(() => {
    const element = container;
    if (!element) return;
    return untrack(() => observeContentWidth(element, (width) => (containerWidth = width)));
  });

  // A width that changed by more than half a pixel fits (and draws) again. Untracked: a report
  // can come from an effect, which must not run again because the count moved.
  const widths = createToolbarWidths();
  let measured = $state(0);
  function report(key: string, width: number) {
    if (widths.report(key, width)) untrack(() => (measured += 1));
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
      metrics: widths.metrics(gap, separatorWidth),
      measureKey: toolbarMeasureKey,
      containerWidth,
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

  // ── layout ─────────────────────────────────────────────────────────────────

  /**
   * The center section carries auto margins: it centers in the space the other two leave, and
   * gives way before anything overlaps. The row itself has no gap, so what the fit says fits,
   * fits. Sections never grow or shrink: fitting is the solver's job, not flexbox's.
   */
  const sectionStyle = (name: LiveSection['name']) =>
    `display: flex; align-items: center; gap: ${gap}px; flex: 0 0 auto;` +
    (name === 'center' ? ' margin-left: auto; margin-right: auto;' : '');

  const MEASURE_LAYER =
    'position: absolute; left: 0; top: 0; height: 0; overflow: hidden; visibility: hidden; ' +
    'pointer-events: none; display: flex; white-space: nowrap;';
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
        measure: (width) => report(item.measureKey, width),
      })}
    {:else}
      <NativeSlotSocket name={item.name} onWidth={(width) => report(item.measureKey, width)}>
        {#if item.terminal}
          {@render commandButton(item.terminal, 'icon', item.runTerminal)}
        {/if}
      </NativeSlotSocket>
    {/if}
  {:else if item.kind === 'collapsed'}
    {#if collapsed}
      {@render collapsed(item.view)}
    {:else}
      <DefaultCollapsed view={item.view} />
    {/if}
  {:else if groupTrigger}
    {@render groupTrigger(item.view)}
  {:else}
    <DefaultGroupTrigger view={item.view} />
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
  class={className}
  style="position: relative; display: flex; align-items: center; {style ?? ''}"
>
  {#each layout.sections as section (section.name)}
    <div style={sectionStyle(section.name)}>
      {#each section.groups as group, index (group.id)}
        {#if index > 0}
          {#if separator}
            {@render separator()}
          {:else}
            <span style="width: 1px; align-self: stretch; background: currentColor; opacity: 0.2"
            ></span>
          {/if}
        {/if}
        {#each group.parts as item (item.key)}
          {@render part(item, 'live')}
        {/each}
      {/each}
      {#if section.name === 'end' && layout.hasOverflow}
        <span style="position: relative; display: inline-flex">
          {@render moreButton(overflowOpen, toggleOverflow)}
          {#if overflowMenu}
            {@render overflowMenu(overflowView)}
          {:else}
            <DefaultOverflowMenu view={overflowView} />
          {/if}
        </span>
      {/if}
    </div>
  {/each}

  <!-- The measurement layer: hidden, inert and observed. Text reflow (a language, a font,
       browser zoom) fires the observers; no code handles it. -->
  <div aria-hidden="true" style={MEASURE_LAYER}>
    {#each layout.measured as measuredPart (measuredPart.measureKey)}
      <!-- A custom item without a `custom` snippet is a socket, measured where it renders: a
           second <slot> of its name here would take the projected children from the row. -->
      {#if measuredPart.kind !== 'custom' || custom}
        <Measured onWidth={(width) => report(measuredPart.measureKey, width)}>
          {@render part(measuredPart, 'measure')}
        </Measured>
      {/if}
    {/each}
    <Measured onWidth={(width) => report(toolbarMeasureKey.overflowTrigger, width)}>
      {@render moreButton(false, noop)}
    </Measured>
  </div>
</div>
