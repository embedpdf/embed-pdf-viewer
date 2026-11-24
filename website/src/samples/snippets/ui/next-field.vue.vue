<!-- NextField.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { Anchored } from '@embedpdf/vue/anchored';
import { useForm, useFormState, useFormWidgetAnchor } from '@embedpdf/vue/form';

const form = useForm();
const { fields } = useFormState();

// The next required field that is still empty.
const next = computed(() => {
  void fields.value; // again when a field is filled in
  return form.validate().missing[0] ?? null;
});
const anchor = useFormWidgetAnchor(() =>
  next.value ? (form.getWidgets(next.value.ref)[0]?.ref ?? null) : null,
);
</script>

<template>
  <Anchored v-if="next" :anchor="anchor" placement="left" :gap="6" pinned>
    <button class="next-field" @click="form.focus(next.ref)">
      {{ next.kind === 'signature' ? 'Sign' : 'Fill in' }}
    </button>
  </Anchored>
</template>
