<!--
  <DocumentScope :id>: binds its content to one document, for panes and
  comparisons. The composables inside talk to that document instead of the
  active one, and `useDocuments()` calls without an id use it.
-->
<script setup lang="ts">
import { provideDocumentScope } from './kernel';

const props = defineProps<{
  /** The document's id. */
  id: string;
}>();

defineSlots<{ default?(): unknown }>();

provideDocumentScope(() => props.id);
</script>

<template>
  <slot />
</template>
