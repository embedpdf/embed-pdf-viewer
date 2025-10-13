<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentState } from '../hooks';

interface DocumentContentProps {
  documentId: string | null;
}

const props = defineProps<DocumentContentProps>();
const documentState = useDocumentState(() => props.documentId);

const isLoading = computed(() => documentState.value?.status === 'loading');
const isError = computed(() => documentState.value?.status === 'error');
const isLoaded = computed(() => documentState.value?.status === 'loaded');
</script>

<template>
  <slot
    v-if="documentState"
    :documentState="documentState"
    :isLoading="isLoading"
    :isError="isError"
    :isLoaded="isLoaded"
  />
</template>
