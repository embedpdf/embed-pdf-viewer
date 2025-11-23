<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { provideAnchorRegistry } from './registries/anchor-registry.svelte';
  import { provideComponentRegistry } from './registries/component-registry.svelte';
  import { provideRenderers } from './registries/renderers-registry.svelte';
  import type { BaseComponentProps, UIComponents, UIRenderers } from './types';
  import AutoMenuRenderer from './auto-menu-renderer.svelte';

  /**
   * UIProvider Props
   */
  interface Props {
    children: Snippet;

    /**
     * Document ID for this UI context
     * Required for menu rendering
     */
    documentId: string;

    /**
     * Custom component registry
     * Maps component IDs to components
     */
    components?: UIComponents;

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

  let { children, documentId, components = {}, renderers, menuContainer = null }: Props = $props();

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
   * ```svelte
   * <EmbedPDF {engine} {plugins}>
   *   {#snippet children({ pluginsReady, activeDocumentId })}
   *     {#if pluginsReady && activeDocumentId}
   *       <UIProvider
   *         documentId={activeDocumentId}
   *         components={{
   *           'thumbnail-panel': ThumbnailPanel,
   *           'bookmark-panel': BookmarkPanel,
   *         }}
   *         renderers={{
   *           toolbar: ToolbarRenderer,
   *           panel: PanelRenderer,
   *           menu: MenuRenderer,
   *         }}
   *       >
   *         {#snippet children()}
   *           <ViewerLayout />
   *         {/snippet}
   *       </UIProvider>
   *     {/if}
   *   {/snippet}
   * </EmbedPDF>
   * ```
   */

  // Provide all registries
  provideAnchorRegistry();
  provideComponentRegistry(components);
  provideRenderers(renderers);
</script>

{@render children()}

<!-- Automatically render menus for this document -->
<AutoMenuRenderer {documentId} container={menuContainer} />
