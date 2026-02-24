<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';
import {
  ViewContext,
  useAllViews,
  useViewManagerCapability,
} from '@embedpdf/plugin-view-manager/vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { Columns2, Plus, FolderOpen } from 'lucide-vue-next';
import ViewManagerExampleTabBar from './view-manager-example-tab-bar.vue';

const { provides: viewManager } = useViewManagerCapability();
const { provides: docManager } = useDocumentManagerCapability();
const views = useAllViews();

const canAddView = computed(() => views.value.length < 3);

const gridClass = computed(() => {
  if (views.value.length === 1) return 'grid-cols-1';
  if (views.value.length === 2) return 'grid-cols-2';
  return 'grid-cols-3';
});

const handleAddPane = () => {
  viewManager.value?.createView();
};

const handleOpenFile = async (viewId: string) => {
  if (!docManager.value || !viewManager.value) return;

  try {
    const task = docManager.value.openFileDialog();
    const result = await task.toPromise();

    viewManager.value.addDocumentToView(viewId, result.documentId);
    viewManager.value.setViewActiveDocument(viewId, result.documentId);
  } catch (e) {
    // User cancelled or error
  }
};

const handleRemoveView = (viewId: string) => {
  if (viewManager.value && views.value.length > 1) {
    viewManager.value.removeView(viewId);
  }
};
</script>

<template>
  <!-- Toolbar -->
  <div
    class="flex items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-2">
      <Columns2 :size="14" class="text-gray-500 dark:text-gray-400" />
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Split View
      </span>
      <div class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />
      <span class="text-xs text-gray-600 dark:text-gray-300">
        {{ views.length }} {{ views.length === 1 ? 'pane' : 'panes' }}
      </span>
    </div>

    <div class="flex items-center gap-1">
      <button
        @click="handleAddPane"
        :disabled="!canAddView"
        class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus :size="14" />
        <span class="hidden sm:inline">Add Pane</span>
      </button>
    </div>
  </div>

  <!-- Layout -->
  <div :class="['grid h-[400px] gap-1 bg-gray-100 p-1 sm:h-[500px] dark:bg-gray-800', gridClass]">
    <ViewContext
      v-for="view in views"
      :key="view.id"
      :view-id="view.id"
      v-slot="{ documentIds, activeDocumentId, setActiveDocument, focus, removeDocument }"
    >
      <div
        @click="focus"
        class="flex flex-col overflow-hidden bg-white ring-1 ring-inset ring-gray-300 transition-all dark:bg-gray-900 dark:ring-gray-700"
      >
        <!-- Tab Bar -->
        <ViewManagerExampleTabBar
          :document-ids="documentIds"
          :active-document-id="activeDocumentId"
          :can-remove-view="views.length > 1"
          @select="setActiveDocument"
          @remove-document="removeDocument"
          @open-file="handleOpenFile(view.id)"
          @remove-view="handleRemoveView(view.id)"
        />

        <!-- Content Area -->
        <div class="relative flex-1 bg-gray-50 dark:bg-gray-800">
          <template v-if="activeDocumentId">
            <Viewport
              :document-id="activeDocumentId"
              class="absolute inset-0 bg-gray-200 dark:bg-gray-800"
            >
              <Scroller :document-id="activeDocumentId">
                <template #default="{ page }">
                  <RenderLayer :document-id="activeDocumentId" :page-index="page.pageIndex" />
                </template>
              </Scroller>
            </Viewport>
          </template>
          <template v-else>
            <div
              class="flex h-full flex-col items-center justify-center gap-2 p-4 text-gray-400 dark:text-gray-500"
            >
              <FolderOpen :size="32" :stroke-width="1.5" />
              <p class="text-center text-xs">No document</p>
              <button
                @click="handleOpenFile(view.id)"
                class="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
              >
                <Plus :size="12" />
                Open File
              </button>
            </div>
          </template>
        </div>
      </div>
    </ViewContext>
  </div>
</template>
