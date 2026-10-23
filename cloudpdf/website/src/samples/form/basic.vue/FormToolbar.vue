<script setup lang="ts">
import { useFormState } from '@embedpdf/vue/form';

const { fields } = useFormState();
</script>

<template>
  <div class="toolbar">
    <output class="readout">{{ fields.length }} fields: click one and fill it in</output>
  </div>
</template>
