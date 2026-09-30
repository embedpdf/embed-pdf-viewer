<script setup lang="ts">
import { useAnnotation, useAnnotationProperties } from '@embedpdf/vue/annotation';
import Control from './Control.vue'; // your own control

const annotation = useAnnotation();
const panel = useAnnotationProperties(); // a ref: { properties, values, mixed }
</script>

<template>
  <Control
    v-for="property in panel.properties"
    :key="property.key"
    :property="property"
    :value="panel.values[property.key]"
    :mixed="panel.mixed.includes(property.key)"
    @change="(value) => annotation.selection.update({ [property.key]: value })"
  />
</template>
