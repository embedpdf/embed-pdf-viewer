<script setup lang="ts">
import { computed } from 'vue';
import { useInteractionState } from '@embedpdf/vue/interaction';
import { Toolbar } from '@embedpdf/vue/toolbar';
import { formBar, mainBar } from './bars';
import ToolbarButton from './ToolbarButton.vue';

const { activeToolId } = useInteractionState();
const bar = computed(() => (activeToolId.value === 'form-edit' ? formBar : mainBar));
</script>

<template>
  <Toolbar :bar>
    <template #command="{ command, variant, run }">
      <ToolbarButton :command :variant @click="run()" />
    </template>
  </Toolbar>
</template>
