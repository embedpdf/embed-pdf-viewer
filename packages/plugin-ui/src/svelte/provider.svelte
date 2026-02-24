<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { provideAnchorRegistry } from './registries/anchor-registry.svelte';
  import { provideComponentRegistry } from './registries/component-registry.svelte';
  import { provideRenderers } from './registries/renderers-registry.svelte';
  import type { UIComponents, UIRenderers } from './types';
  import AutoMenuRenderer from './auto-menu-renderer.svelte';
  import UIRoot from './root.svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  /**
   * UIProvider Props
   */
  type ProviderProps = HTMLAttributes<HTMLDivElement> & {
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

    class?: string;
  };

  let {
    children,
    documentId,
    components = {},
    renderers,
    menuContainer = null,
    class: className,
    ...restProps
  }: ProviderProps = $props();

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

<UIRoot class={className} {...restProps}>
  {@render children()}
  <AutoMenuRenderer {documentId} container={menuContainer} />
</UIRoot>
