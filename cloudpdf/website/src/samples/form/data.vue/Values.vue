<!-- The values as plain data, keyed by full name: what you'd send to your backend. -->
<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { useForm, useFormState } from '@embedpdf/vue/form';

const form = useForm();
const { fields } = useFormState();
const values = shallowRef(form.exportValues());
// The fields change with every value, so this reads the values again each time.
watch(fields, () => (values.value = form.exportValues()));
</script>

<template>
  <pre class="values">{{ JSON.stringify(values, null, 2) }}</pre>
</template>
