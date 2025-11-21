<template>
  <component
    v-if="activeMenu && menuSchema && MenuRenderer"
    :is="MenuRenderer"
    :schema="menuSchema"
    :documentId="documentId"
    :anchorEl="activeMenu.anchorEl"
    :onClose="handleClose"
    :container="container"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useUIState, useUICapability } from './hooks/use-ui';
import { useAnchorRegistry } from './registries/anchor-registry';
import { useRenderers } from './registries/renderers-registry';

/**
 * Automatically renders menus when opened
 *
 * This component:
 * 1. Listens to UI plugin state for open menus
 * 2. Looks up anchor elements from the anchor registry
 * 3. Renders menus using the user-provided menu renderer
 */

interface Props {
  documentId: string; // Which document's menus to render
  container?: HTMLElement | null;
}

const props = defineProps<Props>();

const { state: uiState } = useUIState(props.documentId);
const { provides } = useUICapability();
const anchorRegistry = useAnchorRegistry();
const renderers = useRenderers();

const activeMenu = ref<{
  menuId: string;
  anchorEl: HTMLElement | null;
} | null>(null);

const openMenus = computed(() => uiState.value?.openMenus || {});
const schema = computed(() => provides.value?.getSchema());

// Update active menu when state changes
watch(
  openMenus,
  (menus) => {
    const openMenuIds = Object.keys(menus);

    if (openMenuIds.length > 0) {
      // Show the first open menu (in practice, should only be one)
      const menuId = openMenuIds[0];
      if (!menuId) {
        activeMenu.value = null;
        return;
      }

      const menuState = menus[menuId];
      if (menuState && menuState.triggeredByItemId) {
        // Look up anchor with documentId scope
        const anchor = anchorRegistry.getAnchor(props.documentId, menuState.triggeredByItemId);
        activeMenu.value = { menuId, anchorEl: anchor };
      } else {
        activeMenu.value = null;
      }
    } else {
      activeMenu.value = null;
    }
  },
  { immediate: true },
);

const menuSchema = computed(() => {
  if (!activeMenu.value || !schema.value) return null;

  const menuSchemaValue = schema.value.menus[activeMenu.value.menuId];
  if (!menuSchemaValue) {
    console.warn(`Menu "${activeMenu.value.menuId}" not found in schema`);
    return null;
  }

  return menuSchemaValue;
});

const handleClose = () => {
  if (activeMenu.value) {
    provides.value?.forDocument(props.documentId).closeMenu(activeMenu.value.menuId);
  }
};

// Use the user-provided menu renderer
const MenuRenderer = computed(() => renderers.menu);
</script>
