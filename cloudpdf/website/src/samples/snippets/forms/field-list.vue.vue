<script setup lang="ts">
import { useFormState } from '@embedpdf/vue/form';

const { fields } = useFormState();
</script>

<template>
  <ul>
    <li v-for="field in fields" :key="field.name">{{ field.name }}: {{ field.family }}</li>
  </ul>
</template>
