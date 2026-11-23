<script setup lang="ts">
import { computed } from 'vue';
import { useForm, useFormState } from '@embedpdf/vue/form';
import Tag from './Tag.vue';

const form = useForm();
const { fields } = useFormState();

// A tag on every required field that is still empty.
const missing = computed(() => {
  void fields.value; // again when a field is filled in
  return form.validate().missing;
});
</script>

<template>
  <Tag v-for="field in missing" :key="field.name" :field="field" />
</template>
