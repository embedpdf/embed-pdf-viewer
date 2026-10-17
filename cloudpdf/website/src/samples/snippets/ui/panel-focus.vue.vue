<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { useSurfaceFocus } from '@embedpdf/vue/shell';

const field = useTemplateRef<HTMLInputElement>('field');
// The cursor goes in the field when the panel asks for it, its text selected.
useSurfaceFocus('search', field, { select: true });
</script>

<template>
  <input ref="field" placeholder="Search" />
</template>
