<!--
  One part of the toolbar (a command, a custom item, a folded group, a shed
  group's button), drawn through the toolbar's slots, which <Toolbar> passes
  on, or a plain default. A slot that draws nothing for a part falls back to the
  default too, so `#custom` can draw only the items it knows.
-->
<script setup lang="ts">
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import DefaultCollapsed from './DefaultCollapsed.vue';
import DefaultCommand from './DefaultCommand.vue';
import DefaultGroupTrigger from './DefaultGroupTrigger.vue';
import NativeSlotSocket from './NativeSlotSocket.vue';
import type { CollapsedGroupView, GroupDisclosureView, ToolbarPart } from './views';

const props = defineProps<{
  part: ToolbarPart;
  /** `'live'` in the visible row, `'measure'` in the hidden measurement layer. */
  layer: 'live' | 'measure';
}>();

const emit = defineEmits<{ width: [key: string, width: number] }>();

defineSlots<{
  command?(props: { command: ResolvedCommand; variant: string; run: () => void }): unknown;
  custom?(props: {
    name: string;
    variant: string;
    layer: 'live' | 'measure';
    measure: (width: number) => void;
  }): unknown;
  collapsed?(props: { view: CollapsedGroupView }): unknown;
  'group-trigger'?(props: { view: GroupDisclosureView }): unknown;
}>();

/** A custom item reporting its own width, under its key. */
const measure = (width: number) => {
  if (props.part.kind === 'custom') emit('width', props.part.measureKey, width);
};
</script>

<template>
  <slot
    v-if="part.kind === 'command'"
    name="command"
    :command="part.command"
    :variant="part.variant"
    :run="part.run"
  >
    <DefaultCommand :command="part.command" :run="part.run" />
  </slot>

  <!-- An object binding: `name` on a slot outlet is the outlet's own name, not a prop. -->
  <slot
    v-else-if="part.kind === 'custom' && $slots.custom"
    name="custom"
    v-bind="{ name: part.name, variant: part.variant, layer, measure }"
  >
    <!-- Nothing drawn for this item: its command, as a button. -->
    <slot
      v-if="part.terminal"
      name="command"
      :command="part.terminal"
      variant="icon"
      :run="part.runTerminal"
    >
      <DefaultCommand :command="part.terminal" :run="part.runTerminal" />
    </slot>
  </slot>

  <NativeSlotSocket
    v-else-if="part.kind === 'custom'"
    :name="part.name"
    :measure-key="part.measureKey"
    @width="(key, width) => emit('width', key, width)"
  >
    <slot
      v-if="part.terminal"
      name="command"
      :command="part.terminal"
      variant="icon"
      :run="part.runTerminal"
    >
      <DefaultCommand :command="part.terminal" :run="part.runTerminal" />
    </slot>
  </NativeSlotSocket>

  <slot v-else-if="part.kind === 'collapsed'" name="collapsed" :view="part.view">
    <DefaultCollapsed :view="part.view" />
  </slot>

  <slot v-else name="group-trigger" :view="part.view">
    <DefaultGroupTrigger :view="part.view" />
  </slot>
</template>
