<template>
  <UIRoot v-bind="attrs">
    <slot />
    <!-- Automatically render menus for this document -->
    <AutoMenuRenderer :documentId="documentId" :container="menuContainer" />
  </UIRoot>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { useAttrs } from 'vue';
import { provideAnchorRegistry } from './registries/anchor-registry';
import { provideComponentRegistry } from './registries/component-registry';
import { provideRenderers } from './registries/renderers-registry';
import type { BaseComponentProps, UIRenderers } from './types';
import AutoMenuRenderer from './auto-menu-renderer.vue';
import UIRoot from './root.vue';

// Disable automatic attribute inheritance since we pass them to UIRoot
defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();

/**
 * UIProvider Props
 */
interface Props {
  /**
   * Document ID for this UI context
   * Required for menu rendering
   */
  documentId: string;

  /**
   * Custom component registry
   * Maps component IDs to components
   */
  components?: Record<string, Component<BaseComponentProps>>;

  /**
   * REQUIRED: User-provided renderers
   * These define how toolbars, panels, and menus are displayed
   */
  renderers: UIRenderers;

  /**
   * Optional: Container for menu portal
   * Defaults to document.body
   */
  menuContainer?: HTMLElement | null;
}

const props = withDefaults(defineProps<Props>(), {
  components: () => ({}),
  menuContainer: null,
});

/**
 * UIProvider - Single provider for all UI plugin functionality
 *
 * Manages:
 * - Anchor registry for menu positioning
 * - Component registry for custom components
 * - Renderers for toolbars, panels, and menus
 * - Automatic menu rendering
 *
 * @example
 * ```vue
 * <EmbedPDF :engine="engine" :plugins="plugins">
 *   <template v-slot="{ pluginsReady, activeDocumentId }">
 *     <UIProvider
 *       v-if="pluginsReady && activeDocumentId"
 *       :documentId="activeDocumentId"
 *       :components="{
 *         'thumbnail-panel': ThumbnailPanel,
 *         'bookmark-panel': BookmarkPanel,
 *       }"
 *       :renderers="{
 *         toolbar: ToolbarRenderer,
 *         panel: PanelRenderer,
 *         menu: MenuRenderer,
 *       }"
 *       class="relative flex h-full w-full"
 *     >
 *       <ViewerLayout />
 *     </UIProvider>
 *   </template>
 * </EmbedPDF>
 * ```
 */

// Provide all registries
provideAnchorRegistry();
provideComponentRegistry(props.components);
provideRenderers(props.renderers);
</script>
