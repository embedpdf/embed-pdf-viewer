<!--
  A PDF list box as a visible native <select>. A list box needs one owner for
  its pixels, hit-testing and scrolling: a baked picture under an invisible
  select can't give that, since the browser and the PDF would each keep their
  own top row. This control is never re-created, so its scroll position stays
  where the user left it. While a write is on its way it shows the user's
  choice (`@embedpdf/web`'s `createOptimisticSelection`), and it follows the
  engine's selection when that changes. Its `style` falls through to the
  <select>.
-->
<script setup lang="ts">
import { onUnmounted, ref, shallowRef, watch } from 'vue';
import { createOptimisticSelection, isolateWheel, showSelectedOptions } from '@embedpdf/web';

export interface NativeListBoxOption {
  label: string;
  value: string;
}

const props = defineProps<{
  /** The accessible name: the field's tooltip, else its full name. */
  label: string;
  disabled: boolean;
  multi: boolean;
  options: readonly NativeListBoxOption[];
  /** The engine's selection. */
  selected: readonly string[];
  /**
   * Writes a choice. A function rather than an event, because its promise
   * matters: a write that fails puts the engine's selection back.
   */
  onSelect: (values: string[]) => void | Promise<unknown>;
}>();

const emit = defineEmits<{ focus: []; blur: [] }>();

const selection = createOptimisticSelection(props.selected);
const shown = shallowRef(selection.get());
onUnmounted(selection.subscribe(() => (shown.value = selection.get())));
watch(
  () => props.selected,
  (values) => selection.setConfirmed(values),
);

const control = ref<HTMLSelectElement | null>(null);

// The Stage's wheel handler lives on an ancestor and prevents the default to
// pan or zoom the page. Stop at the list, so the browser scrolls it instead.
watch(
  control,
  (element, _previous, onCleanup) => {
    if (element) onCleanup(isolateWheel(element));
  },
  { immediate: true, flush: 'post' },
);

// What the control shows, set on its options (`showSelectedOptions`): a
// `:value` binding can't hold several values.
watch(
  [control, shown, () => props.options],
  ([element, values]) => {
    if (element) showSelectedOptions(element, values);
  },
  { immediate: true, flush: 'post' },
);

function onChange(event: Event): void {
  const element = event.currentTarget as HTMLSelectElement;
  selection.choose(
    Array.from(element.selectedOptions).map((option) => option.value),
    props.onSelect,
  );
}
</script>

<template>
  <select
    ref="control"
    :aria-label="label"
    :multiple="multi"
    :size="Math.max(2, options.length)"
    :disabled="disabled"
    @focus="emit('focus')"
    @blur="emit('blur')"
    @change="onChange"
  >
    <option v-for="(option, index) in options" :key="index" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
