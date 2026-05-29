import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { ConsoleLogger, PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
  DocumentManagerPlugin,
} from '@embedpdf/plugin-document-manager/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { MarqueeZoom, ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { SearchLayer, SearchPluginPackage } from '@embedpdf/plugin-search/react';
import {
  GlobalPointerProvider,
  PagePointerProvider,
  InteractionManagerPluginPackage,
} from '@embedpdf/plugin-interaction-manager/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { Rotate, RotatePluginPackage } from '@embedpdf/plugin-rotate/react';
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/react';
import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { RedactionLayer, RedactionPluginPackage } from '@embedpdf/plugin-redaction/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { CapturePluginPackage, MarqueeCapture } from '@embedpdf/plugin-capture/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import {
  AnnotationLayer,
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationTool,
} from '@embedpdf/plugin-annotation/react';
import { WatermarkPluginPackage } from '@embedpdf/plugin-watermark';
import { CircularProgress, Box, Alert } from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import BrandingWatermarkOutlinedIcon from '@mui/icons-material/BrandingWatermarkOutlined';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PageControls } from './components/page-controls';
import { Search } from './components/search';
import { Drawer, DrawerComponent, DrawerProvider } from './components/drawer-system';
import { Sidebar } from './components/sidebar';
import { Toolbar } from './components/toolbar';
import { ViewSidebarReverseIcon } from './icons';
import { AnnotationSelectionMenu } from './components/annotation-selection-menu';
import { RedactionSelectionMenu } from './components/redaction-selection-menu';
import { WatermarkPanel } from './components/watermark-panel';

const consoleLogger = new ConsoleLogger();
const WATERMARK_TAKEOVER_PLACEMENT_THRESHOLD = 500;

function App() {
  const isDev = useMemo(
    () => new URLSearchParams(window.location.search).get('dev') === 'true',
    [],
  );

  const { engine, isLoading, error } = usePdfiumEngine(isDev ? { logger: consoleLogger } : {});
  const popperContainerRef = useRef<HTMLDivElement>(null);
  const [watermarkBusy, setWatermarkBusy] = useState<{
    isApplying: boolean;
    status: string;
    fullPageTakeover: boolean;
    startedAt: number;
  }>({
    isApplying: false,
    status: '',
    fullPageTakeover: false,
    startedAt: 0,
  });
  const [watermarkBusyElapsedSeconds, setWatermarkBusyElapsedSeconds] = useState(0);

  const handleWatermarkApplyStateChange = useCallback(
    (state: { isApplying: boolean; status: string; fullPageTakeover: boolean }) => {
      setWatermarkBusy((prev) => ({
        isApplying: state.isApplying,
        status: state.status,
        fullPageTakeover: state.fullPageTakeover,
        startedAt: state.isApplying ? (prev.isApplying ? prev.startedAt : Date.now()) : 0,
      }));
    },
    [],
  );

  useEffect(() => {
    if (!watermarkBusy.isApplying || watermarkBusy.startedAt === 0) {
      setWatermarkBusyElapsedSeconds(0);
      return;
    }

    const tick = () => {
      setWatermarkBusyElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - watermarkBusy.startedAt) / 1000)),
      );
    };

    tick();
    const intervalId = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [watermarkBusy.isApplying, watermarkBusy.startedAt]);

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
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 2.5,
        extraRings: 0,
      }),
      createPluginRegistration(ExportPluginPackage),
      createPluginRegistration(PrintPluginPackage),
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
      createPluginRegistration(WatermarkPluginPackage),
    ],
    [],
  );

  if (error) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Alert severity="error">Failed to initialize PDF viewer: {error.message}</Alert>
      </Box>
    );
  }

  if (isLoading || !engine) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <EmbedPDF
      engine={engine}
      logger={isDev ? consoleLogger : undefined}
      plugins={plugins}
      onInitialized={async (registry) => {
        // Load default PDF URL on initialization
        registry
          ?.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
          ?.provides()
          ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
          .toPromise();

        // Add custom annotation tool
        const annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
        annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
          id: 'stampApproved',
          name: 'Stamp Approved',
          interaction: {
            exclusive: false,
            cursor: 'crosshair',
          },
          matchScore: () => 0,
          defaults: {
            type: PdfAnnotationSubtype.STAMP,
            imageSrc:
              'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Eo_circle_green_checkmark.svg/512px-Eo_circle_green_checkmark.svg.png',
            imageSize: { width: 20, height: 20 },
          },
        });
      }}
    >
      {({ pluginsReady }) => (
        <>
          {pluginsReady ? (
            <DocumentContext>
              {({ activeDocumentId }) => {
                // Define drawer components with documentId from context
                const drawerComponents: DrawerComponent[] = [
                  {
                    id: 'search',
                    component: Search,
                    icon: SearchOutlinedIcon,
                    label: 'Search',
                    position: 'right',
                    props: { documentId: activeDocumentId },
                  },
                  {
                    id: 'sidebar',
                    component: Sidebar,
                    icon: ViewSidebarReverseIcon,
                    label: 'Sidebar',
                    position: 'left',
                    props: { documentId: activeDocumentId },
                  },
                  {
                    id: 'watermark',
                    component: WatermarkPanel,
                    icon: BrandingWatermarkOutlinedIcon,
                    label: 'Watermark',
                    position: 'right',
                    props: {
                      documentId: activeDocumentId,
                      takeoverPlacementThreshold: WATERMARK_TAKEOVER_PLACEMENT_THRESHOLD,
                      onApplyStateChange: handleWatermarkApplyStateChange,
                    },
                  },
                ];

                return (
                  <DrawerProvider components={drawerComponents}>
                    <Box
                      sx={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        userSelect: 'none',
                      }}
                    >
                      {activeDocumentId && <Toolbar documentId={activeDocumentId} />}

                      {/* Main content area with sidebars */}
                      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                        {/* Left Sidebar */}
                        <Drawer position="left" />

                        {/* Main Viewport */}
                        <Box
                          ref={popperContainerRef}
                          sx={{
                            flex: '1 1 0', // grow / shrink, flex-basis 0
                            minWidth: 0, // allow shrinking inside flex row
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                          }}
                        >
                          {activeDocumentId && (
                            <DocumentContent documentId={activeDocumentId}>
                              {({ isLoading: docLoading, isLoaded }) => (
                                <>
                                  {docLoading && (
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        height: '100%',
                                        width: '100%',
                                      }}
                                    >
                                      <CircularProgress size={48} />
                                    </Box>
                                  )}
                                  {isLoaded && (
                                    <GlobalPointerProvider documentId={activeDocumentId}>
                                      <Viewport
                                        documentId={activeDocumentId}
                                        style={{
                                          width: '100%',
                                          height: '100%',
                                          flexGrow: 1,
                                          backgroundColor: '#f1f3f5',
                                          overflow: 'auto',
                                        }}
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
                                                  selectionMenu={(props) => (
                                                    <RedactionSelectionMenu
                                                      {...props}
                                                      documentId={activeDocumentId}
                                                      container={popperContainerRef.current}
                                                    />
                                                  )}
                                                />
                                                <AnnotationLayer
                                                  documentId={activeDocumentId}
                                                  pageIndex={pageIndex}
                                                  selectionMenu={(props) => (
                                                    <AnnotationSelectionMenu
                                                      {...props}
                                                      documentId={activeDocumentId}
                                                      container={popperContainerRef.current}
                                                    />
                                                  )}
                                                />
                                              </PagePointerProvider>
                                            </Rotate>
                                          )}
                                        />
                                        <PageControls documentId={activeDocumentId} />
                                      </Viewport>
                                    </GlobalPointerProvider>
                                  )}
                                </>
                              )}
                            </DocumentContent>
                          )}
                        </Box>

                        {/* Right Sidebar */}
                        <Drawer position="right" />
                      </Box>

                      {watermarkBusy.isApplying && watermarkBusy.fullPageTakeover && (
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 2500,
                            backgroundColor: 'rgba(17, 24, 39, 0.45)',
                            backdropFilter: 'blur(2px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            p: 3,
                          }}
                        >
                          <Box
                            sx={{
                              width: 'min(560px, 92vw)',
                              bgcolor: 'background.paper',
                              borderRadius: 2,
                              boxShadow: 6,
                              p: 3,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 1.25,
                              textAlign: 'center',
                            }}
                          >
                            <CircularProgress size={34} />
                            <Alert severity="info" sx={{ width: '100%' }}>
                              {watermarkBusy.status || 'Applying watermark across pages...'}
                            </Alert>
                            <Box>
                              <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
                                Viewer interactions are paused while watermark processing is in progress.
                              </Box>
                              {watermarkBusyElapsedSeconds >= 15 && (
                                <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                                  Still running ({watermarkBusyElapsedSeconds}s). Large documents can take a while.
                                </Box>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </DrawerProvider>
                );
              }}
            </DocumentContext>
          ) : (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                width: '100%',
              }}
            >
              <CircularProgress size={48} />
            </Box>
          )}
        </>
      )}
    </EmbedPDF>
  );
}

export default App;
