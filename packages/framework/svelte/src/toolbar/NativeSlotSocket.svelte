<!--
  The socket for a custom item when no `custom` snippet draws it: a real, native <slot> element.
  Inside a shadow root (a custom element that renders the toolbar) the browser projects the
  host's same-named children into it; anywhere else it shows its own content, the item's
  command. It is measured where it renders, never in the measurement layer: only the first
  <slot> of a name gets the projected children.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { observeWidth } from '@embedpdf/web';

  let {
    name,
    onWidth,
    children,
  }: { name: string; onWidth: (width: number) => void; children?: Snippet } = $props();

  let socket: HTMLElement | undefined = $state();

  // A child slotted in or out resizes the socket's box, so one observer covers both.
  $effect(() => {
    const element = socket;
    if (!element) return;
    return untrack(() => observeWidth(element, (width) => onWidth(width)));
  });
</script>

<!-- `svelte:element` makes the element itself: Svelte reads a <slot> tag as its own syntax. -->
<svelte:element
  this={'slot'}
  bind:this={socket}
  {name}
  style="display: inline-flex; align-items: center; flex-shrink: 0"
>
  {@render children?.()}
</svelte:element>
