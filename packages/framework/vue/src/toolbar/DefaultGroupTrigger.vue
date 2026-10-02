<!--
  The default button of a group that shed items: a chevron opening a menu of
  what it shed. It shows as pressed while one of those is active, a hint that
  the active item is in there.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import DefaultOverflowMenu from './DefaultOverflowMenu.vue';
import { groupMenuView } from '@embedpdf/core-ui';
import type { GroupDisclosureView } from './views';
import { ACTIVE, BORDER } from './paint';

const props = defineProps<{ view: GroupDisclosureView }>();

const isOpen = ref(false);
const someActive = computed(() => props.view.commands.some((command) => command.active));
const menu = computed(() => groupMenuView(props.view, isOpen.value, () => (isOpen.value = false)));
</script>

<template>
  <span :style="{ position: 'relative', display: 'inline-flex' }">
    <button
      type="button"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      title="More"
      :style="{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 6px',
        color: 'inherit',
        font: 'inherit',
        border: `1px solid ${BORDER}`,
        borderRadius: '4px',
        background: isOpen || someActive ? ACTIVE : 'transparent',
        cursor: 'pointer',
      }"
      @click="isOpen = !isOpen"
    >
      ▾
    </button>
    <DefaultOverflowMenu :view="menu" />
  </span>
</template>
