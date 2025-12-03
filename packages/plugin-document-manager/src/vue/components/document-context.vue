<script setup lang="ts">
import { useOpenDocuments, useActiveDocument, useDocumentManagerCapability } from '../hooks';
import type { DocumentState } from '@embedpdf/core';

export interface TabActions {
  select: (documentId: string) => void;
  close: (documentId: string) => void;
  move: (documentId: string, toIndex: number) => void;
}

export interface DocumentContextRenderProps {
  documentStates: DocumentState[];
  activeDocumentId: string | null;
  actions: TabActions;
}

const documentStates = useOpenDocuments();
const { activeDocumentId } = useActiveDocument();
const { provides } = useDocumentManagerCapability();

const actions: TabActions = {
  select: (documentId: string) => {
    provides.value?.setActiveDocument(documentId);
  },
  close: (documentId: string) => {
    provides.value?.closeDocument(documentId);
  },
  move: (documentId: string, toIndex: number) => {
    provides.value?.moveDocument(documentId, toIndex);
  },
};
</script>

<template>
  <!--
    Headless component for managing document tabs
    Provides all state and actions, completely UI-agnostic
    
    @example
    <DocumentContext>
      <template #default="{ documentStates, activeDocumentId, actions }">
        <div class="tabs">
          <button
            v-for="doc in documentStates"
            :key="doc.id"
            @click="actions.select(doc.id)"
            :class="{ active: doc.id === activeDocumentId }"
          >
            {{ doc.name }}
            <button @click.stop="actions.close(doc.id)">×</button>
          </button>
        </div>
      </template>
    </DocumentContext>
  -->
  <slot :documentStates="documentStates" :activeDocumentId="activeDocumentId" :actions="actions" />
</template>
