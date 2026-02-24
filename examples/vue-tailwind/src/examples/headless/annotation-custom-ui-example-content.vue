<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, type CSSProperties } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { Pencil, Square, GitBranch, Stamp, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const activeTool = ref<string | null>(null);
const canDelete = ref(false);

const { provides: annotationCapability } = useAnnotationCapability();
const annotationApi = computed(() => annotationCapability.value?.forDocument(props.documentId));

const tools = [
  { id: 'square', name: 'Square', icon: Square },
  { id: 'ink', name: 'Pen', icon: Pencil },
  { id: 'polyline', name: 'Polyline', icon: GitBranch },
  { id: 'stampImage', name: 'Stamp', icon: Stamp },
];

let unsubscribeToolChange: (() => void) | undefined;
let unsubscribeStateChange: (() => void) | undefined;

onMounted(() => {
  if (!annotationApi.value) return;

  unsubscribeToolChange = annotationApi.value.onActiveToolChange((tool) => {
    activeTool.value = tool?.id ?? null;
  });

  unsubscribeStateChange = annotationApi.value.onStateChange((state) => {
    canDelete.value = !!state.selectedUid;
  });
});

onUnmounted(() => {
  unsubscribeToolChange?.();
  unsubscribeStateChange?.();
});

const handleToolClick = (toolId: string) => {
  annotationApi.value?.setActiveTool(activeTool.value === toolId ? null : toolId);
};

const handleDelete = () => {
  const selection = annotationApi.value?.getSelectedAnnotation();
  if (selection) {
    annotationApi.value?.deleteAnnotation(selection.object.pageIndex, selection.object.id);
  }
};

const handleDeleteFromMenu = (pageIndex: number, id: string) => {
  annotationApi.value?.deleteAnnotation(pageIndex, id);
};

// --- Custom handle style helpers ---

const resizeHandleStyle = (style: CSSProperties, backgroundColor?: string): CSSProperties => ({
  ...style,
  backgroundColor: 'transparent',
  border: `2px solid ${backgroundColor ?? '#475569'}`,
  borderRadius: '2px',
});

const vertexHandleStyle = (style: CSSProperties, backgroundColor?: string): CSSProperties => ({
  ...style,
  backgroundColor: backgroundColor ?? '#475569',
  borderRadius: '1px',
  transform: `${(style as any)?.transform ?? ''} rotate(45deg)`.trim(),
});

const rotationHandleStyle = (style: CSSProperties, backgroundColor?: string): CSSProperties => ({
  ...style,
  backgroundColor: backgroundColor ?? '#475569',
  borderRadius: '999px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
});
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          v-for="tool in tools"
          :key="tool.id"
          @click="handleToolClick(tool.id)"
          :class="[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
            activeTool === tool.id
              ? 'bg-slate-600 text-white ring-1 ring-slate-700'
              : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
          ]"
          :title="tool.name"
        >
          <component :is="tool.icon" :size="14" />
          <span class="hidden sm:inline">{{ tool.name }}</span>
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <button
        @click="handleDelete"
        :disabled="!canDelete"
        class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 :size="14" />
        <span class="hidden sm:inline">Delete</span>
      </button>

      <span
        v-if="activeTool"
        class="hidden animate-pulse text-xs text-slate-600 lg:inline dark:text-slate-400"
      >
        Click on the PDF to add annotation
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[450px] sm:h-[550px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :scale="1"
                style="pointer-events: none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
              <AnnotationLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :resize-ui="{ size: 10, color: '#475569' }"
                :vertex-ui="{ size: 10, color: '#475569' }"
                :rotation-ui="{
                  size: 24,
                  color: '#475569',
                  iconColor: 'white',
                  margin: 28,
                  showConnector: true,
                  connectorColor: '#94a3b8',
                }"
                :selection-outline="{ color: '#475569', style: 'solid', width: 1, offset: 2 }"
                :group-selection-outline="{
                  color: '#64748b',
                  style: 'dashed',
                  width: 2,
                  offset: 3,
                }"
              >
                <!-- Custom square resize handles -->
                <template #resize-handle="{ style, backgroundColor, key: _key, ...rest }">
                  <div v-bind="rest" :style="resizeHandleStyle(style, backgroundColor)" />
                </template>

                <!-- Custom diamond vertex handles -->
                <template #vertex-handle="{ style, backgroundColor, key: _key, ...rest }">
                  <div v-bind="rest" :style="vertexHandleStyle(style, backgroundColor)" />
                </template>

                <!-- Custom pill-shaped rotation handle -->
                <template
                  #rotation-handle="{
                    style,
                    backgroundColor,
                    connectorStyle,
                    showConnector,
                    iconColor,
                    border: _border,
                    ...rest
                  }"
                >
                  <div v-if="showConnector && connectorStyle" :style="connectorStyle" />
                  <div v-bind="rest" :style="rotationHandleStyle(style, backgroundColor)">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      :stroke="iconColor ?? 'white'"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M1 4v6h6" />
                      <path d="M23 20v-6h-6" />
                      <path
                        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"
                      />
                    </svg>
                  </div>
                </template>

                <!-- Selection menu -->
                <template #selection-menu="{ selected, context, menuWrapperProps, rect }">
                  <div v-if="selected" v-bind="menuWrapperProps">
                    <div
                      class="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                      :style="{
                        position: 'absolute',
                        top: `${rect.size.height + 8}px`,
                        pointerEvents: 'auto',
                        cursor: 'default',
                      }"
                    >
                      <div class="flex items-center gap-1 px-2 py-1">
                        <button
                          @click="
                            handleDeleteFromMenu(
                              context.annotation.object.pageIndex,
                              context.annotation.object.id,
                            )
                          "
                          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-400"
                          aria-label="Delete annotation"
                          title="Delete annotation"
                        >
                          <Trash2 :size="16" />
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </AnnotationLayer>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
