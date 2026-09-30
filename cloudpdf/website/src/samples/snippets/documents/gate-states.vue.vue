<script setup lang="ts">
import { DocumentGate } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import PasswordForm from './PasswordForm.vue';
import Spinner from './Spinner.vue';
</script>

<template>
  <DocumentGate>
    <template #fallback><Spinner /></template>
    <template #locked="{ document }"><PasswordForm :document="document" /></template>
    <template #error="{ document }">
      <p>Couldn't open {{ document.name }}: {{ document.error.message }}</p>
    </template>
    <Stage>
      <template #page><RenderLayer /></template>
    </Stage>
  </DocumentGate>
</template>
