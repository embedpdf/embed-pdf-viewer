<script setup lang="ts">
import { computed } from 'vue';
import { useStageState } from '@embedpdf/vue/stage';
import BottomSheet from './BottomSheet.vue';
import SidePanel from './SidePanel.vue';

const { activeRules } = useStageState();
const compact = computed(() => activeRules.value.includes('compact'));
</script>

<template>
  <BottomSheet v-if="compact" />
  <SidePanel v-else />
</template>
