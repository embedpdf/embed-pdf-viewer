<!--
  One element of the toolbar's measurement layer: reports its length along the toolbar (its width,
  or its height in a vertical one) now and whenever it resizes (a new language, a font loading,
  your CSS). With `onlyWhenDrawn` it reports only while it holds something: a custom item that
  draws nothing here is measured where it renders, by the `ctx.measure` it reports to.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { observeLength, type Orientation } from '@embedpdf/web';

  let {
    orientation,
    onLength,
    onlyWhenDrawn = false,
    children,
  }: {
    orientation: Orientation;
    onLength: (length: number) => void;
    onlyWhenDrawn?: boolean;
    children?: Snippet;
  } = $props();

  let element: HTMLSpanElement | undefined = $state();

  /** Whether `element` holds an element or text: a snippet that drew nothing leaves only anchors. */
  const drewSomething = (measured: Element): boolean =>
    [...measured.childNodes].some(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE ||
        (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''),
    );

  $effect(() => {
    const measured = element;
    const along = orientation;
    if (!measured) return;
    // The report writes the toolbar's lengths, which this effect must not depend on.
    return untrack(() =>
      observeLength(measured, along, (length) => {
        if (!onlyWhenDrawn || drewSomething(measured)) onLength(length);
      }),
    );
  });
</script>

<span bind:this={element} style="display: inline-flex; flex-shrink: 0">{@render children?.()}</span>
