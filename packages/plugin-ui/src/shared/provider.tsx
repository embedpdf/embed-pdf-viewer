import type { ReactNode, ComponentType, HTMLAttributes } from '@framework';
import { AnchorRegistryProvider } from './registries/anchor-registry';
import { ComponentRegistryProvider } from './registries/component-registry';
import { RenderersProvider } from './registries/renderers-registry';
import { BaseComponentProps, UIRenderers } from './types';
import { AutoMenuRenderer } from './auto-menu-renderer';
import { UIRoot } from './root';

/**
 * UIProvider Props
 */
export interface UIProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;

  /**
   * Document ID for this UI context
   * Required for menu rendering
   */
  documentId: string;

  /**
   * Custom component registry
   * Maps component IDs to components
   */
  components?: Record<string, ComponentType<BaseComponentProps>>;

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
 * ```tsx
 * <EmbedPDF engine={engine} plugins={plugins}>
 *   {({ pluginsReady }) => (
 *     pluginsReady && (
 *       <DocumentContext>
 *         {({ activeDocumentId }) => (
 *           activeDocumentId && (
 *             <UIProvider
 *               documentId={activeDocumentId}
 *               components={{
 *                 'thumbnail-panel': ThumbnailPanel,
 *                 'bookmark-panel': BookmarkPanel,
 *               }}
 *               renderers={{
 *                 toolbar: ToolbarRenderer,
 *                 panel: PanelRenderer,
 *                 menu: MenuRenderer,
 *               }}
 *             >
 *               <ViewerLayout />
 *             </UIProvider>
 *           )
 *         )}
 *       </DocumentContext>
 *     )
 *   )}
 * </EmbedPDF>
 * ```
 */
export function UIProvider({
  children,
  documentId,
  components = {},
  renderers,
  menuContainer,
  ...restProps
}: UIProviderProps) {
  return (
    <AnchorRegistryProvider>
      <ComponentRegistryProvider initialComponents={components}>
        <RenderersProvider renderers={renderers}>
          <UIRoot {...restProps}>
            {children}
            {/* Automatically render menus for this document */}
            <AutoMenuRenderer documentId={documentId} container={menuContainer} />
          </UIRoot>
        </RenderersProvider>
      </ComponentRegistryProvider>
    </AnchorRegistryProvider>
  );
}
