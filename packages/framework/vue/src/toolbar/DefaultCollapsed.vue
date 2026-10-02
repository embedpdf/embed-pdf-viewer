<!--
  The default folded group: a <select> for `collapse: 'select'`, else a "More"
  style button with a menu of the group's commands.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import DefaultOverflowMenu from './DefaultOverflowMenu.vue';
import DefaultOverflowTrigger from './DefaultOverflowTrigger.vue';
import { groupMenuView } from '@embedpdf/core-ui';
import type { CollapsedGroupView } from './views';
import { BORDER, SURFACE } from './paint';

const props = defineProps<{ view: CollapsedGroupView }>();

const active = computed(() => props.view.commands.find((command) => command.active)?.id ?? '');

const isOpen = ref(false);
const menu = computed(() => groupMenuView(props.view, isOpen.value, () => (isOpen.value = false)));

function onChange(event: Event) {
  props.view.execute((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select
    v-if="view.collapse === 'select'"
    :value="active"
    :style="{
      padding: '4px 6px',
      font: 'inherit',
      borderRadius: '4px',
      border: `1px solid ${BORDER}`,
      background: SURFACE,
    }"
    @change="onChange"
  >
    <option
      v-for="command in view.commands"
      :key="command.id"
      :value="command.id"
      :disabled="!command.enabled"
    >
      {{ command.label }}
    </option>
  </select>
  <span v-else :style="{ position: 'relative', display: 'inline-flex' }">
    <DefaultOverflowTrigger :is-open="isOpen" @toggle="isOpen = !isOpen" />
    <DefaultOverflowMenu :view="menu" />
  </span>
</template>
