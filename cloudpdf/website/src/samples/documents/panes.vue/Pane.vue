<script setup lang="ts">
import { DocumentGate, DocumentScope, useDocumentsState } from '@embedpdf/vue/runtime';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useViewManager, useViewManagerState } from '@embedpdf/vue/view-manager';
import type { PaneInfo } from '@embedpdf/vue/view-manager';

const props = defineProps<{ pane: PaneInfo; canRemove: boolean }>();

const views = useViewManager();
const focusedPaneId = useViewManagerState((state) => state.focusedPaneId);
const { documents } = useDocumentsState();
const nameOf = (id: string) => documents.value.find((document) => document.id === id)?.name ?? id;

function split() {
  if (props.pane.activeDocumentId) views.splitPane(props.pane.activeDocumentId, { from: props.pane.id });
}
</script>

<template>
  <section
    class="pane"
    :data-focused="pane.id === focusedPaneId"
    @pointerdown="views.setFocusedPane(pane.id)"
  >
    <div class="bar" role="tablist">
      <button
        v-for="id in pane.documentIds"
        :key="id"
        type="button"
        role="tab"
        class="tab"
        :aria-selected="id === pane.activeDocumentId"
        @click="views.setActiveDocument(pane.id, id)"
      >
        {{ nameOf(id) }}
      </button>
      <button
        type="button"
        class="button"
        :disabled="!pane.activeDocumentId || pane.documentIds.length < 2"
        @click="split"
      >
        Split
      </button>
      <button
        type="button"
        class="button"
        :disabled="!canRemove"
        @click="views.removePane(pane.id)"
      >
        Close pane
      </button>
    </div>
    <DocumentScope v-if="pane.activeDocumentId" :id="pane.activeDocumentId">
      <DocumentGate>
        <template #fallback><p class="empty">Opening…</p></template>
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </DocumentGate>
    </DocumentScope>
    <p v-else class="empty">No document in this pane.</p>
  </section>
</template>
