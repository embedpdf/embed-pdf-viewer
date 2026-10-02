<script setup lang="ts">
import { useAnnotationProperties } from '@embedpdf/vue/annotation';
import Control from './Control.vue';

// What the selection can change, with its current values.
const panel = useAnnotationProperties();
</script>

<template>
  <p v-if="panel.properties.length === 0" class="panel empty">Select an annotation</p>
  <dl v-else class="panel properties">
    <div v-for="property in panel.properties" :key="property.key" class="property">
      <dt>{{ property.label }}</dt>
      <dd><Control :property="property" /></dd>
    </div>
  </dl>
</template>
