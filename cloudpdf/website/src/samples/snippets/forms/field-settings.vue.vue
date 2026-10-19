<script setup lang="ts">
import { useForm, useFormState } from '@embedpdf/vue/form';

const form = useForm();
const { selectedField: field } = useFormState();
</script>

<template>
  <template v-if="field">
    <input
      :value="field.name"
      @blur="form.update(field.ref, { name: ($event.target as HTMLInputElement).value })"
    />
    <label>
      <input
        type="checkbox"
        :checked="field.required"
        @change="form.update(field.ref, { required: ($event.target as HTMLInputElement).checked })"
      />
      Required
    </label>
  </template>
</template>
