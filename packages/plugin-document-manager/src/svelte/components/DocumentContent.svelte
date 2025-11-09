<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { DocumentState } from '@embedpdf/core';

  export interface DocumentContentRenderProps {
    documentState: DocumentState;
    isLoading: boolean;
    isError: boolean;
    isLoaded: boolean;
  }

  interface DocumentContentProps {
    documentId: string | null;
    children: Snippet<[DocumentContentRenderProps]>;
  }

  let { documentId, children }: DocumentContentProps = $props();

  const docState = useDocumentState(documentId);

  const isLoading = $derived(docState.current?.status === 'loading');
  const isError = $derived(docState.current?.status === 'error');
  const isLoaded = $derived(docState.current?.status === 'loaded');
</script>

<!--
  Headless component for rendering document content with loading/error states
  
  @example
  <DocumentContent {documentId}>
    {#snippet children({ documentState, isLoading, isError, isLoaded })}
      {#if isLoading}
        <LoadingSpinner />
      {:else if isError}
        <ErrorMessage />
      {:else if isLoaded}
        <PDFViewer {documentState} />
      {/if}
    {/snippet}
  </DocumentContent>
-->
{#if docState.current}
  {@render children({
    documentState: docState.current,
    isLoading,
    isError,
    isLoaded,
  })}
{/if}
