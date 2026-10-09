<!-- A document keeps the permissions it opened with, so a new role opens it again. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import type { OpenSource } from '@embedpdf/vue/runtime';

const props = defineProps<{ role: string; ebook: OpenSource }>();

const documents = useDocuments();
const { id } = useDocument();

let opened = props.role;
watch([() => props.role, id], ([role, current]) => {
  if (role === opened || !current) return;
  opened = role;
  void documents.close(current).then(() => documents.open(props.ebook, { name: 'ebook.pdf' }));
});
</script>

<template></template>
