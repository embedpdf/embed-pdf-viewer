<!--
  The socket for a custom item no `#custom` slot draws: a real, native <slot>
  element. Inside a shadow root (a custom element that renders the toolbar)
  the browser projects the host's same-named children into it; anywhere else it
  shows its own content, the item's command. It is measured where it renders,
  never in the measurement layer: only the first <slot> of a name gets the
  projected children. One that grows fills its item's box, and reports its own
  length without the growth.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { observeLength, observeOwnLength } from '@embedpdf/web';
import type { Orientation } from '@embedpdf/web';

const props = defineProps<{
  name: string;
  measureKey: string;
  orientation: Orientation;
  grow: boolean;
}>();
const emit = defineEmits<{ length: [key: string, length: number] }>();
defineSlots<{ default?(): unknown }>();

const socket = ref<HTMLSlotElement | null>(null);
// A child slotted in or out resizes the socket's box, so one observer covers both.
watch(
  [socket, () => props.measureKey, () => props.orientation, () => props.grow],
  ([element, key, orientation, grow], _previous, onCleanup) => {
    if (!element) return;
    const report = (length: number) => emit('length', key, length);
    onCleanup(
      grow
        ? observeOwnLength(element, orientation, report)
        : observeLength(element, orientation, report),
    );
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <!-- `:is` makes the element itself: a <slot> tag in a template is Vue's own slot outlet. -->
  <component
    :is="'slot'"
    ref="socket"
    :name="name"
    :style="{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, flexGrow: grow ? 1 : 0 }"
  >
    <slot />
  </component>
</template>
