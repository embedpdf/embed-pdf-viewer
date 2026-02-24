<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useViewManagerCapability } from '../hooks';
import type { View } from '@embedpdf/plugin-view-manager';

export interface ViewContextRenderProps {
  view: View;
  documentIds: string[];
  activeDocumentId: string | null;
  isFocused: boolean;
  addDocument: (documentId: string, index?: number) => void;
  removeDocument: (documentId: string) => void;
  setActiveDocument: (documentId: string | null) => void;
  moveDocumentWithinView: (documentId: string, index: number) => void;
  focus: () => void;
}

interface ViewContextProps {
  viewId: string;
  autoCreate?: boolean;
}

const props = withDefaults(defineProps<ViewContextProps>(), {
  autoCreate: true,
});

const { provides } = useViewManagerCapability();
const view = ref<View | null>(null);
const isFocused = ref(false);

watch(
  [provides, () => props.viewId, () => props.autoCreate],
  ([providesValue, vId, autoCreateValue], _, onCleanup) => {
    if (!providesValue) {
      view.value = null;
      isFocused.value = false;
      return;
    }

    // Get or create view
    let v = providesValue.getView(vId);
    if (!v && autoCreateValue) {
      providesValue.createView(vId);
      v = providesValue.getView(vId);
    }
    view.value = v;
    isFocused.value = providesValue.getFocusedViewId() === vId;

    const unsubFocus = providesValue.onViewFocusChanged((event) => {
      isFocused.value = event.currentViewId === vId;
    });

    const unsubAdded = providesValue.onDocumentAddedToView((event) => {
      if (event.viewId === vId) {
        view.value = providesValue.getView(vId);
      }
    });

    const unsubRemoved = providesValue.onDocumentRemovedFromView((event) => {
      if (event.viewId === vId) {
        view.value = providesValue.getView(vId);
      }
    });

    const unsubActiveChanged = providesValue.onViewActiveDocumentChanged((event) => {
      if (event.viewId === vId) {
        view.value = providesValue.getView(vId);
      }
    });

    onCleanup(() => {
      unsubFocus();
      unsubAdded();
      unsubRemoved();
      unsubActiveChanged();
    });
  },
  { immediate: true },
);

const slotProps = computed<ViewContextRenderProps | null>(() => {
  if (!view.value || !provides.value) return null;

  return {
    view: view.value,
    documentIds: view.value.documentIds,
    activeDocumentId: view.value.activeDocumentId,
    isFocused: isFocused.value,
    addDocument: (docId: string, index?: number) =>
      provides.value?.addDocumentToView(props.viewId, docId, index),
    removeDocument: (docId: string) => provides.value?.removeDocumentFromView(props.viewId, docId),
    setActiveDocument: (docId: string | null) =>
      provides.value?.setViewActiveDocument(props.viewId, docId),
    moveDocumentWithinView: (docId: string, index: number) =>
      provides.value?.moveDocumentWithinView(props.viewId, docId, index),
    focus: () => provides.value?.setFocusedView(props.viewId),
  };
});
</script>

<template>
  <!--
    Headless component for managing a single view with multiple documents
    
    @example
    <ViewContext viewId="main-view">
      <template #default="{ view, documentIds, activeDocumentId, isFocused, addDocument, removeDocument, setActiveDocument, focus }">
        <div :class="{ focused: isFocused }" @click="focus">
          <button
            v-for="docId in documentIds"
            :key="docId"
            @click="setActiveDocument(docId)"
            :class="{ active: docId === activeDocumentId }"
          >
            {{ docId }}
            <button @click.stop="removeDocument(docId)">×</button>
          </button>
        </div>
      </template>
    </ViewContext>
  -->
  <slot v-if="slotProps" v-bind="slotProps" />
</template>
