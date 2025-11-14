<script lang="ts">
  import type { Snippet } from 'svelte';
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

  interface DocumentContextProps {
    children: Snippet<[DocumentContextRenderProps]>;
  }

  let { children }: DocumentContextProps = $props();

  const openDocuments = useOpenDocuments();
  const activeDoc = useActiveDocument();
  const capability = useDocumentManagerCapability();

  const actions: TabActions = {
    select: (documentId: string) => {
      capability.provides?.setActiveDocument(documentId);
    },
    close: (documentId: string) => {
      capability.provides?.closeDocument(documentId);
    },
    move: (documentId: string, toIndex: number) => {
      capability.provides?.moveDocument(documentId, toIndex);
    },
  };
</script>

<!--
  Headless component for managing document tabs
  Provides all state and actions, completely UI-agnostic
  
  @example
  <DocumentContext>
    {#snippet children({ documentStates, activeDocumentId, actions })}
      <div class="tabs">
        {#each documentStates as doc (doc.id)}
          <button
            onclick={() => actions.select(doc.id)}
            class:active={doc.id === activeDocumentId}
          >
            {doc.name}
            <button onclick={(e) => { e.stopPropagation(); actions.close(doc.id); }}>×</button>
          </button>
        {/each}
      </div>
    {/snippet}
  </DocumentContext>
-->
{@render children({
  documentStates: openDocuments.current,
  activeDocumentId: activeDoc.activeDocumentId,
  actions,
})}
