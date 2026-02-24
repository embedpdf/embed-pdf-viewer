<template>
  <!-- Desktop rendering -->
  <div
    v-if="isOpen && !isMobile"
    :class="`${positionClasses} flex h-full flex-col`"
    :style="widthStyle"
    :data-panel-id="schema.id"
  >
    <!-- Tabs panel -->
    <template v-if="content.type === 'tabs' && availableTabs.length > 0">
      <div class="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          type="button"
          :class="`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab.id === activeTabId
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`"
          @click="handleTabSelect(tab.id)"
          role="tab"
          :aria-selected="tab.id === activeTabId"
        >
          {{ translate(tab.labelKey || tab.id, { fallback: tab.label || tab.id }) }}
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        <component
          v-if="activeTab"
          :is="
            renderCustomComponent(activeTab.componentId, documentId, {
              tabId: activeTab.id,
              onClose,
            })
          "
        />
      </div>
    </template>

    <!-- Component-only panel -->
    <div v-else-if="content.type === 'component'" class="flex-1 overflow-auto">
      <component :is="renderCustomComponent(content.componentId, documentId, { onClose })" />
    </div>
  </div>

  <!-- Mobile bottom sheet -->
  <template v-else-if="isOpen && isMobile">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
      @click="onClose"
    />

    <!-- Bottom Sheet -->
    <div
      :class="`fixed bottom-0 left-0 right-0 z-50 ${heightClass} flex flex-col rounded-t-2xl bg-white shadow-2xl transition-all duration-300`"
      :style="{ transform: `translateY(${dragOffset}px)` }"
      :data-panel-id="schema.id"
    >
      <!-- Drag Handle & Header -->
      <div
        class="flex cursor-grab items-center justify-between border-b border-gray-200 px-4 py-3 active:cursor-grabbing"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
      >
        <div class="flex flex-1 justify-center">
          <div class="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <button
          @click="onClose"
          class="ml-2 rounded-full p-1 transition-colors hover:bg-gray-100"
          aria-label="Close panel"
        >
          <CloseIcon class="h-5 w-5 text-gray-600" />
        </button>
      </div>

      <!-- Tabs (mobile) -->
      <div
        v-if="content.type === 'tabs' && availableTabs.length > 0"
        class="flex gap-2 border-b border-gray-200 bg-gray-50 p-2"
      >
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          type="button"
          :class="`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            tab.id === activeTabId
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`"
          @click="handleTabSelect(tab.id)"
          role="tab"
          :aria-selected="tab.id === activeTabId"
        >
          {{ translate(tab.labelKey || tab.id, { fallback: tab.label || tab.id }) }}
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto">
        <component
          v-if="content.type === 'tabs' && activeTab"
          :is="
            renderCustomComponent(activeTab.componentId, documentId, {
              tabId: activeTab.id,
              onClose,
            })
          "
        />
        <component
          v-else-if="content.type === 'component'"
          :is="renderCustomComponent(content.componentId, documentId, { onClose })"
        />
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { SidebarRendererProps } from '@embedpdf/plugin-ui/vue';
import { useUICapability, useUIState, useItemRenderer } from '@embedpdf/plugin-ui/vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import { CloseIcon } from '../components/icons';

/**
 * Schema-driven Panel Renderer
 *
 * Renders panels (sidebars) defined in the UI schema.
 * - Desktop: Side panel (left/right)
 * - Mobile: Bottom sheet with swipe gestures
 */

const props = defineProps<SidebarRendererProps>();

const { provides } = useUICapability();
const { state: uiState } = useUIState(props.documentId);
const { renderCustomComponent } = useItemRenderer();
const { translate } = useTranslations(props.documentId);

// Mobile detection
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth < 768;
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

// Bottom sheet state for mobile
type BottomSheetHeight = 'half' | 'full';
const sheetHeight = ref<BottomSheetHeight>('half');
const isDragging = ref(false);
const startY = ref(0);
const currentY = ref(0);

const heightClass = computed(() => (sheetHeight.value === 'full' ? 'h-[100vh]' : 'h-[50vh]'));
const dragOffset = computed(() =>
  isDragging.value ? Math.max(0, currentY.value - startY.value) : 0,
);

const content = computed(() => props.schema.content);
const widthStyle = computed(() => (props.schema.width ? { width: props.schema.width } : undefined));
const positionClasses = computed(() =>
  getPositionClasses(props.schema.position?.placement ?? 'left'),
);

// Tabs logic
const availableTabs = computed(() =>
  content.value.type === 'tabs' ? (content.value.tabs ?? []) : [],
);

const resolvedActiveTabId = computed(() => {
  if (content.value.type !== 'tabs') return null;
  const stateActive = uiState.value?.sidebarTabs?.[props.schema.id];
  if (stateActive) return stateActive;
  const scopeActive = provides.value
    ?.forDocument(props.documentId)
    .getSidebarTab?.(props.schema.id);
  if (scopeActive) return scopeActive;
  return content.value.defaultTab ?? availableTabs.value[0]?.id ?? null;
});

const localActiveTabId = ref<string | null>(null);

watch(resolvedActiveTabId, (newVal) => {
  if (localActiveTabId.value !== null && newVal === localActiveTabId.value) {
    localActiveTabId.value = null;
  }
});

const activeTabId = computed(() => localActiveTabId.value ?? resolvedActiveTabId.value);
const activeTab = computed(
  () => availableTabs.value.find((tab) => tab.id === activeTabId.value) ?? availableTabs.value[0],
);

const handleTabSelect = (tabId: string) => {
  if (tabId === activeTabId.value) return;
  localActiveTabId.value = tabId;
  provides.value?.forDocument(props.documentId).setSidebarTab(props.schema.id, tabId);
};

// Swipe gestures
const handleTouchStart = (e: TouchEvent) => {
  if (!e.touches[0]) return;
  isDragging.value = true;
  startY.value = e.touches[0].clientY;
  currentY.value = e.touches[0].clientY;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value || !e.touches[0]) return;
  currentY.value = e.touches[0].clientY;
};

const handleTouchEnd = () => {
  if (!isDragging.value) return;
  isDragging.value = false;

  const deltaY = currentY.value - startY.value;
  const threshold = 100;

  if (deltaY > threshold) {
    if (sheetHeight.value === 'full') {
      sheetHeight.value = 'half';
    } else {
      props.onClose?.();
    }
  } else if (deltaY < -threshold) {
    if (sheetHeight.value === 'half') {
      sheetHeight.value = 'full';
    }
  }

  startY.value = 0;
  currentY.value = 0;
};

/**
 * Get positioning classes based on panel placement
 */
function getPositionClasses(placement: 'left' | 'right' | 'top' | 'bottom'): string {
  switch (placement) {
    case 'left':
      return 'h-full border-r border-gray-300 bg-white';
    case 'right':
      return 'h-full border-l border-gray-300 bg-white';
    case 'top':
      return 'w-full border-b border-gray-300 bg-white';
    case 'bottom':
      return 'w-full border-t border-gray-300 bg-white';
    default:
      return 'h-full bg-white';
  }
}
</script>
