<script setup lang="ts">
import { useMetadata, useMetadataState } from '@embedpdf/vue/metadata';

const metadata = useMetadata();
const { metadata: fields } = useMetadataState();

function onBlur(event: FocusEvent) {
  metadata.update({ title: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <label>
    Title
    <input :value="fields?.title ?? ''" :disabled="!metadata.canUpdate()" @blur="onBlur" />
  </label>
</template>
