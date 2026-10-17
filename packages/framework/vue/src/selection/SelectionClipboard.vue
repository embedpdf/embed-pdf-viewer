<!--
  <SelectionClipboard>: mount once per viewer to wire copying the selected
  text. It fetches the text when the selection settles, answers the browser's
  `copy` event at once, and falls back to the Clipboard API for Ctrl+C / Cmd+C
  when the page has no selection of its own. A selection the user may not
  copy isn't copied, and it emits `refused`. It draws nothing, and wires
  nothing until a document is ready. For a Copy button, call
  `copySelection(useSelection())` from its click handler instead.
-->
<script setup lang="ts">
import { toValue, watch, type MaybeRefOrGetter } from 'vue';
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
    /**
     * Copy only while focus is inside this element (a template ref), for a
     * page with more than one viewer. Copying works once it has mounted.
     * Default: anywhere on the page.
     */
    target?: MaybeRefOrGetter<HTMLElement | null | undefined>;
  }>(),
  { prefetch: true },
);
const emit = defineEmits<{
  /** Ctrl+C or the Copy menu met a selection the user may not copy: say so. */
  refused: [];
}>();

const selection = useOptionalCapability(SelectionToken);
// Wired again for another document, or when `prefetch` or `target` changes.
watch(
  [selection, () => props.prefetch, () => toValue(props.target)],
  ([lens, prefetch, target], _previous, onCleanup) => {
    // A target that hasn't mounted yet wires nothing; its ref being set runs this again.
    if (!lens || (props.target !== undefined && !target)) return;
    onCleanup(
      wireSelectionClipboard(lens, {
        prefetch,
        target: target ?? undefined,
        onRefused: () => emit('refused'),
      }),
    );
  },
  { immediate: true, flush: 'post' },
);
</script>

<template></template>
