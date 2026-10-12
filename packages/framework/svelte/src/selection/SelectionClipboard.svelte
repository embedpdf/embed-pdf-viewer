<!--
  Copying selected text with the keyboard and the browser's Copy menu. Mount it once per viewer:
  it fetches the selected text when the selection settles, answers the native `copy` event at
  once, and falls back to the async Clipboard API for Ctrl+C / Cmd+C when the page has no DOM
  selection. A selection the user may not copy isn't copied, and `onRefused` is called. It
  draws nothing, and wires nothing until a document is ready. A Copy button calls
  `copySelection(useSelection())` from its click instead.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { SelectionToken } from '@embedpdf/plugin-selection';
  import { wireSelectionClipboard } from '@embedpdf/web';
  import { useOptionalCapability } from '../runtime/readers.svelte';
  import type { SelectionClipboardProps } from './props';

  let { prefetch, onRefused }: SelectionClipboardProps = $props();

  // The capability itself, not a handle: the clipboard wiring keeps it and subscribes to it.
  const selection = useOptionalCapability(SelectionToken);

  $effect(() => {
    const current = selection.current;
    // Read at the moment of the refusal, so a new callback needs no new wiring.
    const options = {
      ...(prefetch === undefined ? {} : { prefetch }),
      onRefused: () => untrack(() => onRefused)?.(),
    };
    if (!current) return;
    return untrack(() => wireSelectionClipboard(current, options));
  });
</script>
