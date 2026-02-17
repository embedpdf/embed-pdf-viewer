import { useEffect, useState, useMemo } from '@framework';
import type { CSSProperties } from '@framework';

import { useDocumentState } from '@embedpdf/core/@framework';

import { useLayoutAnalysisCapability } from '../hooks/use-layout-analysis';
import { PageLayout } from '@embedpdf/plugin-layout-analysis';

export interface LayoutAnalysisLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  /** Confidence threshold — blocks below this are hidden. */
  threshold?: number;
  style?: CSSProperties;
}

const CLASS_COLORS: Record<string, string> = {
  text: 'rgba(59, 130, 246, 0.15)',
  table: 'rgba(16, 185, 129, 0.15)',
  image: 'rgba(245, 158, 11, 0.15)',
  doc_title: 'rgba(139, 92, 246, 0.15)',
  header: 'rgba(236, 72, 153, 0.15)',
  footer: 'rgba(107, 114, 128, 0.15)',
  formula: 'rgba(6, 182, 212, 0.15)',
  chart: 'rgba(249, 115, 22, 0.15)',
  abstract: 'rgba(168, 85, 247, 0.15)',
  paragraph_title: 'rgba(99, 102, 241, 0.15)',
  reference: 'rgba(75, 85, 99, 0.15)',
};

const CLASS_BORDER_COLORS: Record<string, string> = {
  text: 'rgba(59, 130, 246, 0.7)',
  table: 'rgba(16, 185, 129, 0.7)',
  image: 'rgba(245, 158, 11, 0.7)',
  doc_title: 'rgba(139, 92, 246, 0.7)',
  header: 'rgba(236, 72, 153, 0.7)',
  footer: 'rgba(107, 114, 128, 0.7)',
  formula: 'rgba(6, 182, 212, 0.7)',
  chart: 'rgba(249, 115, 22, 0.7)',
  abstract: 'rgba(168, 85, 247, 0.7)',
  paragraph_title: 'rgba(99, 102, 241, 0.7)',
  reference: 'rgba(75, 85, 99, 0.7)',
};

function getColorForLabel(label: string): string {
  return CLASS_COLORS[label] ?? `hsla(${hashCode(label) % 360}, 70%, 50%, 0.15)`;
}

function getBorderColorForLabel(label: string): string {
  return CLASS_BORDER_COLORS[label] ?? `hsla(${hashCode(label) % 360}, 70%, 50%, 0.7)`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * LayoutAnalysisLayer renders bounding boxes over a PDF page
 * for all detected layout elements.
 *
 * Place on top of the RenderLayer with the same dimensions.
 * Accepts an optional `scale` prop; falls back to the document's
 * current scale from the core store.
 */
export function LayoutAnalysisLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  threshold = 0.35,
  style,
}: LayoutAnalysisLayerProps) {
  const { provides: layoutAnalysis } = useLayoutAnalysisCapability();
  const documentState = useDocumentState(documentId);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  const scope = useMemo(
    () => layoutAnalysis?.forDocument(documentId),
    [layoutAnalysis, documentId],
  );

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  useEffect(() => {
    if (!scope) {
      setLayout(null);
      return;
    }
    setLayout(scope.getPageLayout(pageIndex));
    return scope.onPageLayoutChange((event) => {
      if (event.pageIndex === pageIndex) {
        setLayout(event.layout);
      }
    });
  }, [scope, pageIndex]);

  const filteredBlocks = useMemo(() => {
    if (!layout) return [];
    return layout.blocks.filter((block) => block.score >= threshold);
  }, [layout, threshold]);

  if (!layout || filteredBlocks.length === 0) {
    return null;
  }

  const containerStyle: CSSProperties = {
    pointerEvents: 'none',
    ...style,
  };

  return (
    <div style={containerStyle} data-layout-analysis-layer="">
      {filteredBlocks.map((block) => {
        const isSelected = selectedBlockId === block.id;

        const blockStyle: CSSProperties = {
          position: 'absolute',
          left: block.rect.origin.x * actualScale,
          top: block.rect.origin.y * actualScale,
          width: block.rect.size.width * actualScale,
          height: block.rect.size.height * actualScale,
          backgroundColor: getColorForLabel(block.label),
          border: `1.5px solid ${getBorderColorForLabel(block.label)}`,
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          cursor: 'pointer',
          opacity: isSelected ? 1 : 0.8,
          outline: isSelected ? '2px solid #3b82f6' : 'none',
          transition: 'opacity 0.15s',
        };

        const labelStyle: CSSProperties = {
          position: 'absolute',
          top: '-18px',
          left: '0',
          fontSize: '10px',
          lineHeight: '16px',
          padding: '0 4px',
          backgroundColor: getBorderColorForLabel(block.label),
          color: '#fff',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        };

        return (
          <div
            key={block.id}
            style={blockStyle}
            data-block-id={block.id}
            data-block-label={block.label}
            onClick={() => setSelectedBlockId(isSelected ? null : block.id)}
          >
            <span style={labelStyle}>
              {block.label} {(block.score * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
