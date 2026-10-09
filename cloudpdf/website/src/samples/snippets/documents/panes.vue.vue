<script setup lang="ts">
import { DocumentScope } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { useViewManager, useViewManagerState } from '@embedpdf/vue/view-manager';
import PaneTabs from './PaneTabs.vue';

const views = useViewManager();
const { panes, focusedPaneId } = useViewManagerState();
</script>

<template>
  <div class="panes">
    <section
      v-for="pane in panes"
      :key="pane.id"
      :data-focused="pane.id === focusedPaneId"
      @focusin="views.setFocusedPane(pane.id)"
    >
      <PaneTabs :pane="pane" />
      <DocumentScope v-if="pane.activeDocumentId" :id="pane.activeDocumentId">
        <Stage>
          <template #page><RenderLayer /></template>
        </Stage>
      </DocumentScope>
    </section>
  </div>
</template>
