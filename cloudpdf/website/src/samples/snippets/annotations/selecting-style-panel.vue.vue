<script setup lang="ts">
import { useAnnotation, useSelectionFields } from '@embedpdf/vue/annotation';
import Control from './Control.vue'; // your own control

const annotation = useAnnotation();
const panel = useSelectionFields(); // a ref: { fields, values, mixed }
</script>

<template>
  <Control
    v-for="field in panel.fields"
    :key="field.key"
    :field="field"
    :value="panel.values[field.key]"
    :mixed="panel.mixed.includes(field.key)"
    @change="(value) => annotation.selection.update({ [field.key]: value })"
  />
</template>
