<template>
  <template v-if="!isMobile && currentMenu">
    <!-- Desktop dropdown -->
    <div
      ref="menuRef"
      class="animate-fade-in fixed z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white shadow-lg"
      :style="position ? { top: `${position.top}px`, left: `${position.left}px` } : undefined"
      role="menu"
    >
      <!-- Header for submenus -->
      <div
        v-if="menuStack.length > 1"
        class="flex items-center rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-2"
      >
        <button
          @click="navigateBack"
          class="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          aria-label="Go back"
        >
          <ChevronLeftIcon class="h-4 w-4" />
          <span>Back</span>
        </button>
        <span v-if="currentMenu.title" class="ml-auto text-xs font-semibold text-gray-600">
          {{ currentMenu.title }}
        </span>
      </div>

      <!-- Menu items -->
      <div class="py-1">
        <MenuItemRenderer
          v-for="(item, index) in currentMenu.schema.items"
          :key="`${item.type}-${index}`"
          :item="item"
          :documentId="documentId"
          :onClose="onClose"
          :isMobile="false"
          :onNavigateToSubmenu="navigateToSubmenu"
          :responsiveMetadata="responsiveMetadata"
        />
      </div>
    </div>
  </template>

  <template v-else-if="isMobile && currentMenu">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
      @click="onClose"
    />

    <!-- Bottom Sheet -->
    <div
      ref="menuRef"
      class="animate-slide-up fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl"
      role="menu"
    >
      <!-- Header -->
      <div v-if="menuStack.length > 1" class="flex items-center border-b border-gray-200 px-4 py-3">
        <button
          @click="navigateBack"
          class="flex items-center gap-2 font-medium text-blue-600"
          aria-label="Go back"
        >
          <ChevronLeftIcon class="h-5 w-5" />
          <span>Back</span>
        </button>
        <span v-if="currentMenu.title" class="ml-auto text-sm font-semibold text-gray-700">
          {{ currentMenu.title }}
        </span>
      </div>
      <div v-else class="flex justify-center py-3">
        <div class="h-1.5 w-12 rounded-full bg-gray-300" />
      </div>

      <div class="pb-safe px-2">
        <MenuItemRenderer
          v-for="(item, index) in currentMenu.schema.items"
          :key="`${item.type}-${index}`"
          :item="item"
          :documentId="documentId"
          :onClose="onClose"
          :isMobile="true"
          :onNavigateToSubmenu="navigateToSubmenu"
          :responsiveMetadata="responsiveMetadata"
        />
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { MenuRendererProps, MenuSchema } from '@embedpdf/plugin-ui/vue';
import { resolveResponsiveMetadata, useUISchema } from '@embedpdf/plugin-ui/vue';
import { useLocale } from '@embedpdf/plugin-i18n/vue';
import { ChevronLeftIcon } from '../components/icons';
import MenuItemRenderer from './menu/MenuItemRenderer.vue';

/**
 * Schema-driven Menu Renderer
 *
 * Renders menus defined in the UI schema with responsive behavior:
 * - Desktop: Anchored dropdown menu
 * - Mobile: Bottom sheet modal with submenu navigation
 */

const props = defineProps<MenuRendererProps>();

const menuRef = ref<HTMLDivElement | null>(null);
const isMobile = ref(false);
const position = ref<{ top: number; left: number } | null>(null);
const uiSchema = useUISchema();
const locale = useLocale();

interface MenuStackItem {
  menuId: string;
  schema: MenuSchema;
  title?: string;
}

// Navigation stack for mobile submenus
const menuStack = ref<MenuStackItem[]>([
  { menuId: props.schema.id, schema: props.schema, title: undefined },
]);

// Reset stack when schema changes
watch(
  () => props.schema,
  (newSchema) => {
    menuStack.value = [{ menuId: newSchema.id, schema: newSchema, title: undefined }];
  },
);

const currentMenu = computed(() => menuStack.value[menuStack.value.length - 1]);

// Resolve responsive metadata for the current menu
const responsiveMetadata = computed(() =>
  currentMenu.value ? resolveResponsiveMetadata(currentMenu.value.schema, locale.value) : null,
);

const navigateToSubmenu = (submenuId: string, title: string) => {
  if (!uiSchema.value) return;
  const submenuSchema = uiSchema.value.menus[submenuId];
  if (!submenuSchema) {
    console.warn(`Submenu schema not found: ${submenuId}`);
    return;
  }
  menuStack.value.push({ menuId: submenuId, schema: submenuSchema as MenuSchema, title });
};

const navigateBack = () => {
  if (menuStack.value.length > 1) {
    menuStack.value.pop();
  }
};

// Detect mobile/desktop
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

// Calculate menu position relative to anchor
watch(
  [() => props.anchorEl, isMobile],
  () => {
    if (!props.anchorEl || isMobile.value) return;

    const updatePosition = () => {
      if (!props.anchorEl) return;
      const rect = props.anchorEl.getBoundingClientRect();
      const menuWidth = menuRef.value?.offsetWidth || 200;

      let top = rect.bottom + 4;
      let left = rect.left;

      // Adjust if going off-screen
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) {
        left = 8;
      }

      position.value = { top, left };
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    onUnmounted(() => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    });
  },
  { immediate: true },
);

// Close on outside click
onMounted(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      menuRef.value &&
      !menuRef.value.contains(event.target as Node) &&
      props.anchorEl &&
      !props.anchorEl.contains(event.target as Node)
    ) {
      props.onClose();
    }
  };

  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside);
  }, 0);

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside);
  });
});

// Close on escape key
onMounted(() => {
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      props.onClose();
    }
  };

  document.addEventListener('keydown', handleEscape);
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEscape);
  });
});
</script>
