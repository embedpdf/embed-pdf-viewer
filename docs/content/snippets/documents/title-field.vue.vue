<script setup lang="ts">
import { useMetadata, useMetadataState } from '@embedpdf/vue/metadata';

const { update, canUpdate } = useMetadata();
const { metadata } = useMetadataState();

function onBlur(event: FocusEvent) {
  update({ title: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <label>
    Title
    <input :value="metadata?.title ?? ''" :disabled="!canUpdate()" @blur="onBlur" />
  </label>
</template>
