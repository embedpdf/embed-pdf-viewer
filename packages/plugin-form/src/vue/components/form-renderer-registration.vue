<script setup lang="ts">
import { useRegisterRenderers } from '@embedpdf/plugin-annotation/vue';
import { formRenderers } from './form-renderers';

useRegisterRenderers(formRenderers);
</script>

<template>
  <slot />
</template>
