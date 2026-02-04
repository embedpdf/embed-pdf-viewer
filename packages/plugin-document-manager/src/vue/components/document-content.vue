<script setup lang="ts">
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import type { DocumentState } from '@embedpdf/core';

export interface DocumentContentRenderProps {
  documentState: DocumentState;
  isLoading: boolean;
  isError: boolean;
  isLoaded: boolean;
}

interface DocumentContentProps {
  documentId: MaybeRefOrGetter<string | null>;
}

const props = defineProps<DocumentContentProps>();
const documentState = useDocumentState(() => toValue(props.documentId));

const isLoading = computed(() => documentState.value?.status === 'loading');
const isError = computed(() => documentState.value?.status === 'error');
const isLoaded = computed(() => documentState.value?.status === 'loaded');
</script>

<template>
  <!--
    Headless component for rendering document content with loading/error states
    
    @example
    <DocumentContent :documentId="activeDocumentId">
      <template #default="{ documentState, isLoading, isError, isLoaded }">
        <LoadingSpinner v-if="isLoading" />
        <ErrorMessage v-else-if="isError" />
        <PDFViewer v-else-if="isLoaded" :document="documentState" />
      </template>
    </DocumentContent>
  -->
  <slot
    v-if="documentState"
    :documentState="documentState"
    :isLoading="isLoading"
    :isError="isError"
    :isLoaded="isLoaded"
  />
</template>
