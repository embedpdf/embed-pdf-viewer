import { useMemo, useRef, useEffect } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { createPluginRegistration } from '@embedpdf/core';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/react';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/react';
import {
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { ZoomMode, ZoomPluginPackage, MarqueeZoom } from '@embedpdf/plugin-zoom/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/react';
import { Rotate, RotatePluginPackage } from '@embedpdf/plugin-rotate/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { MarqueeCapture, CapturePluginPackage } from '@embedpdf/plugin-capture/react';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationPluginPackage, AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import { CommandsPluginPackage } from '@embedpdf/plugin-commands/react';
import { I18nPluginPackage } from '@embedpdf/plugin-i18n/react';
import { UIPluginPackage } from '@embedpdf/plugin-ui/react';
import { TabBar } from '../components/tab-bar-2';
import { LoadingSpinner } from '../components/loading-spinner';
import { DocumentPasswordPrompt } from '../components/document-password-prompt';
import { PageControls } from '../components/page-controls';
import { ConsoleLogger } from '@embedpdf/models';
import { NavigationBar } from '../components/navigation-bar';
import { EmptyState } from '../components/empty-state';
import { commands } from '../config/commands';
import { viewerUISchema } from '../config/ui-schema';
import { SchemaToolbar } from '../ui/schema-toolbar';
import { SchemaPanel } from '../ui/schema-panel';
import { MenuManagerProvider } from '../ui/menu-manager';
import { AnchorRegistryProvider } from '../ui/anchor-registry';
import { registerAllComponents } from '../ui/register-components';
import { useUIState, useUICapability } from '@embedpdf/plugin-ui/react';

const logger = new ConsoleLogger();

/**
 * Schema-Driven Viewer Page
 *
 * This viewer demonstrates the power of the UI plugin and schema-driven architecture.
 * Instead of hardcoding the toolbar components, the UI is defined declaratively
 * in the UI schema and rendered dynamically.
 *
 * Benefits:
 * - Declarative UI configuration
 * - Type-safe schema
 * - Easily customizable and extensible
 * - Consistent UI patterns
 * - Separation of concerns
 */
export function ViewerSchemaPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = usePdfiumEngine({
    logger,
  });

  // Register all custom components on mount
  useEffect(() => {
    registerAllComponents();
  }, []);

  const plugins = useMemo(
    () => [
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap: 10,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultStrategy: ScrollStrategy.Vertical,
      }),
      createPluginRegistration(DocumentManagerPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(PanPluginPackage),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(RotatePluginPackage),
      createPluginRegistration(ExportPluginPackage),
      createPluginRegistration(PrintPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 2.5,
        extraRings: 0,
      }),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(SearchPluginPackage),
      createPluginRegistration(RedactionPluginPackage),
      createPluginRegistration(CapturePluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(AnnotationPluginPackage),
      createPluginRegistration(FullscreenPluginPackage),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: 120,
        paddingY: 10,
      }),
      // Commands plugin - provides command execution and state management
      createPluginRegistration(CommandsPluginPackage, {
        commands,
      }),
      createPluginRegistration(I18nPluginPackage),
      // UI plugin - provides schema-driven UI rendering
      createPluginRegistration(UIPluginPackage, {
        schema: viewerUISchema,
      }),
    ],
    [],
  );

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (isLoading || !engine) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner message="Loading PDF engine..." />
      </div>
    );
  }

  return (
    <AnchorRegistryProvider>
      <div className="flex h-screen flex-1 flex-col overflow-hidden" ref={containerRef}>
        <NavigationBar />

        <div className="flex flex-1 select-none flex-col overflow-hidden">
          <EmbedPDF
            engine={engine}
            logger={logger}
            plugins={plugins}
            onInitialized={async (registry) => {
              registry
                ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
                ?.provides()
                ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
            }}
          >
            {({ pluginsReady }) => (
              <>
                {pluginsReady ? (
                  <DocumentContext>
                    {({ documentStates, activeDocumentId, actions }) => (
                      <div className="flex h-full flex-col">
                        <TabBar
                          documentStates={documentStates}
                          activeDocumentId={activeDocumentId}
                          onSelect={actions.select}
                          onClose={actions.close}
                          onOpenFile={actions.openFileDialog}
                        />

                        {/* Schema-driven Toolbar and Content - only when document is active */}
                        {activeDocumentId ? (
                          <MenuManagerProvider documentId={activeDocumentId}>
                            <SchemaToolbarRenderer documentId={activeDocumentId} />

                            {/* Document Content Area */}
                            <div
                              id="document-content"
                              className="flex flex-1 overflow-hidden bg-white"
                            >
                              {/* Left Panels */}
                              <SchemaPanelRenderer documentId={activeDocumentId} placement="left" />

                              {/* Main Viewer */}
                              <div className="flex-1 overflow-hidden">
                                <DocumentContent documentId={activeDocumentId}>
                                  {({ documentState, isLoading, isError, isLoaded }) => (
                                    <>
                                      {isLoading && (
                                        <div className="flex h-full items-center justify-center">
                                          <LoadingSpinner message="Loading document..." />
                                        </div>
                                      )}
                                      {isError && (
                                        <DocumentPasswordPrompt documentState={documentState} />
                                      )}
                                      {isLoaded && (
                                        <div className="relative h-full w-full">
                                          <GlobalPointerProvider documentId={activeDocumentId}>
                                            <Viewport
                                              className="bg-gray-100"
                                              documentId={activeDocumentId}
                                            >
                                              <Scroller
                                                documentId={activeDocumentId}
                                                renderPage={({ pageIndex }) => (
                                                  <Rotate
                                                    documentId={activeDocumentId}
                                                    pageIndex={pageIndex}
                                                    style={{ backgroundColor: '#fff' }}
                                                  >
                                                    <PagePointerProvider
                                                      documentId={activeDocumentId}
                                                      pageIndex={pageIndex}
                                                    >
                                                      <RenderLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                        scale={1}
                                                        style={{ pointerEvents: 'none' }}
                                                      />
                                                      <TilingLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                        style={{ pointerEvents: 'none' }}
                                                      />
                                                      <SearchLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                      <MarqueeZoom
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                      <MarqueeCapture
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                      <SelectionLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                      <RedactionLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                      <AnnotationLayer
                                                        documentId={activeDocumentId}
                                                        pageIndex={pageIndex}
                                                      />
                                                    </PagePointerProvider>
                                                  </Rotate>
                                                )}
                                              />
                                              {/* Page Controls */}
                                              <PageControls documentId={activeDocumentId} />
                                            </Viewport>
                                          </GlobalPointerProvider>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </DocumentContent>
                              </div>

                              {/* Right Panels */}
                              <SchemaPanelRenderer
                                documentId={activeDocumentId}
                                placement="right"
                              />
                            </div>
                          </MenuManagerProvider>
                        ) : (
                          <EmptyState />
                        )}
                      </div>
                    )}
                  </DocumentContext>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <LoadingSpinner message="Initializing plugins..." />
                  </div>
                )}
              </>
            )}
          </EmbedPDF>
        </div>
      </div>
    </AnchorRegistryProvider>
  );
}

/**
 * Schema Toolbar Renderer
 *
 * Renders toolbars based on the UI schema from the UI plugin.
 * This renders both the main toolbar and any active secondary toolbars.
 */
function SchemaToolbarRenderer({ documentId }: { documentId: string }) {
  const { provides } = useUICapability();
  const uiState = useUIState(documentId);

  if (!provides || !uiState) return null;

  const schema = provides.getSchema();

  // Get the main toolbar
  const mainToolbar = schema.toolbars['main-toolbar'];

  // Get the active secondary toolbar from UI state
  const secondaryToolbarId = uiState.activeToolbars['top-secondary'];
  const secondaryToolbar = secondaryToolbarId ? schema.toolbars[secondaryToolbarId] : null;

  return (
    <>
      {/* Main Toolbar */}
      {mainToolbar && <SchemaToolbar schema={mainToolbar} documentId={documentId} />}

      {/* Secondary Toolbar (annotation/redaction) - shown when active */}
      {secondaryToolbar && <SchemaToolbar schema={secondaryToolbar} documentId={documentId} />}
    </>
  );
}

/**
 * Schema Panel Renderer
 *
 * Renders panels (sidebars) based on the UI state and schema.
 * Only renders panels that are active for the given placement.
 */
function SchemaPanelRenderer({
  documentId,
  placement,
}: {
  documentId: string;
  placement: 'left' | 'right';
}) {
  const { provides } = useUICapability();
  const uiState = useUIState(documentId);

  if (!provides || !uiState) return null;

  const schema = provides.getSchema();
  const slotKey = `${placement}-main`;
  const activePanelId = uiState.activePanels[slotKey];

  if (!activePanelId) return null;

  const panelSchema = schema.panels[activePanelId];
  if (!panelSchema) {
    console.warn(`Panel schema not found for: ${activePanelId}`);
    return null;
  }

  const handleClose = () => {
    provides.forDocument(documentId).closePanelSlot(placement, 'main');
  };

  return <SchemaPanel schema={panelSchema} documentId={documentId} onClose={handleClose} />;
}
