import { useEffect, useState, useMemo, Fragment } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { useEditPlugin, useEditCapability } from '../hooks/use-edit';
import { EditPageState } from '@embedpdf/plugin-edit';
import { PdfLayoutDebugFlag } from '@embedpdf/models';
import { BackgroundLayer } from './background-layer';
import { TextBlockOverlay } from './text-block-overlay';
import { DebugOverlay } from './debug-overlay';
import { LayoutSummaryPanel } from './layout-summary-panel';

type EditLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
  style?: CSSProperties;
  /** Show debug overlay with layout visualization */
  showDebugOverlay?: boolean;
  /** Which debug elements to show (defaults to all) */
  debugFlags?: PdfLayoutDebugFlag;
  /** Show layout summary panel */
  showLayoutSummary?: boolean;
  /** Position of layout summary panel */
  layoutSummaryPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

export function EditLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  rotation: rotationOverride,
  style,
  showDebugOverlay = false,
  debugFlags,
  showLayoutSummary = false,
  layoutSummaryPosition = 'top-right',
  ...props
}: EditLayerProps) {
  const { plugin: editPlugin } = useEditPlugin();
  const { provides: editCapability } = useEditCapability();
  const documentState = useDocumentState(documentId);

  const [pageState, setPageState] = useState<EditPageState | null>(null);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  const actualRotation = useMemo(() => {
    if (rotationOverride !== undefined) return rotationOverride;
    return documentState?.rotation ?? 0;
  }, [rotationOverride, documentState?.rotation]);

  useEffect(() => {
    if (!editPlugin || !documentId) return;

    return editPlugin.registerEditOnPage({
      documentId,
      pageIndex,
      onStateChange: (state) => {
        setPageState(state);
      },
    });
  }, [editPlugin, documentId, pageIndex]);

  const handleBlockSelect = (blockIndex: number) => {
    editCapability?.forDocument(documentId).selectBlock(pageIndex, blockIndex);
  };

  // Don't render until detection is complete
  if (!pageState || pageState.detectionStatus !== 'detected') {
    return (
      <div style={{ position: 'relative', ...style }} {...props}>
        {pageState?.detectionStatus === 'detecting' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#666',
              fontSize: '14px',
            }}
          >
            Detecting text blocks...
          </div>
        )}
        {pageState?.detectionStatus === 'error' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#f44336',
              fontSize: '14px',
            }}
          >
            Detection failed
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...style }} {...props}>
      {/* Background layer (page without text blocks) */}
      <BackgroundLayer
        documentId={documentId}
        pageIndex={pageIndex}
        scale={actualScale}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />

      {/* Text block overlays */}
      {pageState.textBlocks.map((block, idx) => (
        <TextBlockOverlay
          key={block.index}
          documentId={documentId}
          pageIndex={pageIndex}
          blockIndex={idx}
          block={block}
          isSelected={pageState.selectedBlockIndex === idx}
          offset={pageState.blockOffsets[idx] ?? null}
          scale={actualScale}
          onSelect={() => handleBlockSelect(idx)}
        />
      ))}

      {/* Debug overlay (shows layout visualization) */}
      {showDebugOverlay && (
        <DebugOverlay
          documentId={documentId}
          pageIndex={pageIndex}
          scale={actualScale}
          rotation={actualRotation}
          debugFlags={debugFlags}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      )}

      {/* Layout summary panel */}
      {showLayoutSummary && pageState.layoutSummary && (
        <LayoutSummaryPanel
          layoutSummary={pageState.layoutSummary}
          wordCount={pageState.words.length}
          lineCount={pageState.lines.length}
          columnCount={pageState.columns.length}
          tableCount={pageState.tables.length}
          blockCount={pageState.textBlocks.length}
          position={layoutSummaryPosition}
        />
      )}
    </div>
  );
}
