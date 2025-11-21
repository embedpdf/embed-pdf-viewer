<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useViewManagerCapability } from '../hooks';
  import type { View } from '@embedpdf/plugin-view-manager';
  import type { ViewContextRenderProps } from './types';

  interface ViewContextProps {
    viewId: string;
    autoCreate?: boolean;
    children: Snippet<[ViewContextRenderProps]>;
  }

  let { viewId, autoCreate = true, children }: ViewContextProps = $props();

  const capability = useViewManagerCapability();

  let view = $state<View | null>(null);
  let isFocused = $state(false);

  $effect(() => {
    if (!capability.provides) {
      view = null;
      isFocused = false;
      return;
    }

    // Get or create view
    let v = capability.provides.getView(viewId);
    if (!v && autoCreate) {
      capability.provides.createView(viewId);
      v = capability.provides.getView(viewId);
    }
    view = v;
    isFocused = capability.provides.getFocusedViewId() === viewId;

    const unsubFocus = capability.provides.onViewFocusChanged((event) => {
      isFocused = event.currentViewId === viewId;
    });

    const unsubAdded = capability.provides.onDocumentAddedToView((event) => {
      if (event.viewId === viewId) {
        view = capability.provides!.getView(viewId);
      }
    });

    const unsubRemoved = capability.provides.onDocumentRemovedFromView((event) => {
      if (event.viewId === viewId) {
        view = capability.provides!.getView(viewId);
      }
    });

    const unsubActiveChanged = capability.provides.onViewActiveDocumentChanged((event) => {
      if (event.viewId === viewId) {
        view = capability.provides!.getView(viewId);
      }
    });

    return () => {
      unsubFocus();
      unsubAdded();
      unsubRemoved();
      unsubActiveChanged();
    };
  });

  const slotProps = $derived.by((): ViewContextRenderProps | null => {
    if (!view || !capability.provides) return null;

    return {
      view,
      documentIds: view.documentIds,
      activeDocumentId: view.activeDocumentId,
      isFocused,
      addDocument: (docId: string, index?: number) =>
        capability.provides?.addDocumentToView(viewId, docId, index),
      removeDocument: (docId: string) => capability.provides?.removeDocumentFromView(viewId, docId),
      setActiveDocument: (docId: string | null) =>
        capability.provides?.setViewActiveDocument(viewId, docId),
      moveDocumentWithinView: (docId: string, index: number) =>
        capability.provides?.moveDocumentWithinView(viewId, docId, index),
      focus: () => capability.provides?.setFocusedView(viewId),
    };
  });
</script>

<!--
  Headless component for managing a single view with multiple documents
  
  @example
  <ViewContext viewId="main-view">
    {#snippet children({ view, documentIds, activeDocumentId, isFocused, addDocument, removeDocument, setActiveDocument, focus })}
      <div class:focused={isFocused} onclick={focus}>
        {#each documentIds as docId (docId)}
          <button
            onclick={() => setActiveDocument(docId)}
            class:active={docId === activeDocumentId}
          >
            {docId}
            <button onclick={(e) => { e.stopPropagation(); removeDocument(docId); }}>×</button>
          </button>
        {/each}
      </div>
    {/snippet}
  </ViewContext>
-->
{#if slotProps}
  {@render children?.(slotProps)}
{/if}
