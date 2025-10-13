<script setup lang="ts">
import { useOpenDocuments, useActiveDocument, useDocumentManagerCapability } from '../hooks';

const documents = useOpenDocuments();
const { activeDocumentId } = useActiveDocument();
const { provides } = useDocumentManagerCapability();

const actions = {
  select: (documentId: string) => {
    provides?.value?.setActiveDocument(documentId);
  },
  close: (documentId: string) => {
    provides?.value?.closeDocument(documentId);
  },
  move: (documentId: string, toIndex: number) => {
    provides?.value?.moveDocument(documentId, toIndex);
  },
};
</script>

<template>
  <slot :documents="documents" :activeDocumentId="activeDocumentId" :actions="actions" />
</template>
