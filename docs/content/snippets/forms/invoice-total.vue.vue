<script setup lang="ts">
import { toFieldRef, useFormValue } from '@embedpdf/vue/form';

const total = useFormValue(toFieldRef('invoice.total'));
</script>

<template>
  <output v-if="total && 'value' in total">{{ total.value }}</output>
</template>
