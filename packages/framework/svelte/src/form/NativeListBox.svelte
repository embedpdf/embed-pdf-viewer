<!--
  A PDF list box needs one owner for its pixels, its hit-testing and its scrolling. A baked
  picture with an invisible native select can't give that: the browser and the PDF would each
  keep their own top visible row. So the list is a visible native `<select>`, never made again
  (its scroll position is the user's), showing a choice at once while the engine write is on its
  way and the engine's selection when that changes (`@embedpdf/web`'s
  `createOptimisticSelection`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createOptimisticSelection, isolateWheel } from '@embedpdf/web';
  import type { NativeListBoxProps } from './props';

  let {
    ariaLabel,
    disabled,
    multi,
    options,
    selected,
    onSelect,
    onfocus,
    onblur,
    style = '',
  }: NativeListBoxProps = $props();

  const selection = untrack(() => createOptimisticSelection(selected));
  let shown = $state.raw(selection.get());
  $effect(() => selection.subscribe(() => (shown = selection.get())));
  // The engine's selection, each time the field gives a new one.
  $effect(() => selection.setConfirmed(selected));

  function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
    const values = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
    selection.choose(values, onSelect);
  }

  // The Stage pans or zooms on the wheel from an ancestor: stop it at the list, so the browser
  // scrolls the list with the same wheel event.
  const ownWheel = (element: HTMLElement) => isolateWheel(element);
</script>

<select
  {@attach ownWheel}
  aria-label={ariaLabel}
  multiple={multi}
  size={Math.max(2, options.length)}
  {disabled}
  value={multi ? shown : (shown[0] ?? '')}
  {onfocus}
  {onblur}
  onchange={onChange}
  {style}
>
  {#each options as option, index (index)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
