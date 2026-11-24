<script setup lang="ts">
import { FormLayer, type FieldControl } from '@embedpdf/vue/form';
import FieldSwitch from './FieldSwitch.vue';

const controls: FieldControl[] = [
  {
    for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox',
    component: FieldSwitch,
  },
];
</script>

<template>
  <FormLayer :controls />
</template>
