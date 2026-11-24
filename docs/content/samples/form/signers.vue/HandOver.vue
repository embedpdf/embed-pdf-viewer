<!-- A document keeps the permissions it opened with, so the next person opens the saved form again. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import type { Person } from './people';

const props = defineProps<{ person: Person }>();

const documents = useDocuments();
const { id } = useDocument();

let opened = props.person;
watch([() => props.person, id], async ([person, current]) => {
  if (person === opened || !current) return;
  opened = person;
  const bytes = await documents.download();
  await documents.close(current);
  await documents.open({ kind: 'bytes', bytes }, { name: 'equipment-loan.pdf' });
});
</script>

<template></template>
