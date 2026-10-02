<!--
  <SelectionClipboard>: mount once per viewer to wire copying the selected
  text. It fetches the text when the selection settles, answers the browser's
  `copy` event at once, and falls back to the Clipboard API for Ctrl+C / Cmd+C
  when the page has no selection of its own. It draws nothing, and wires
  nothing until a document is ready. For a Copy button, call
  `copySelection(useSelection())` from its click handler instead.
-->
<script setup lang="ts">
import { watch } from 'vue';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { wireSelectionClipboard } from '@embedpdf/web';
import { useOptionalCapability } from '../runtime/capabilities';

// A boolean prop left out is `false` in Vue: the default says `true` itself.
const props = withDefaults(
  defineProps<{
    /**
     * Fetch the selected text as soon as the selection settles (default true).
     * The browser's `copy` event must be answered at once, so without it only
     * Ctrl+C / Cmd+C copies, a moment later.
     */
    prefetch?: boolean;
  }>(),
  { prefetch: true },
);

const selection = useOptionalCapability(SelectionToken);
// Wired again for another document, or when `prefetch` changes.
watch(
  [selection, () => props.prefetch],
  ([lens, prefetch], _previous, onCleanup) => {
    if (lens) onCleanup(wireSelectionClipboard(lens, { prefetch }));
  },
  { immediate: true },
);
</script>

<template></template>
