import { useEffect, useState, useMemo, useCallback } from '@framework';
import type { CSSProperties } from '@framework';

import { useDocumentState } from '@embedpdf/core/@framework';

import { useLayoutAnalysisCapability } from '../hooks/use-layout-analysis';
import {
  PageLayout,
  LayoutAnalysisState,
  LayoutBlock,
  TableStructureElement,
} from '@embedpdf/plugin-layout-analysis';

export interface LayoutAnalysisLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
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

const TABLE_STRUCTURE_COLOR = 'rgba(234, 88, 12, 0.12)';
const TABLE_STRUCTURE_BORDER = 'rgba(234, 88, 12, 0.5)';

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

export function LayoutAnalysisLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  style,
}: LayoutAnalysisLayerProps) {
  const { provides: layoutAnalysis } = useLayoutAnalysisCapability();
  const documentState = useDocumentState(documentId);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [pluginState, setPluginState] = useState<LayoutAnalysisState | null>(null);

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
      setPluginState(null);
      return;
    }
    setLayout(scope.getPageLayout(pageIndex));
    setPluginState(scope.getState());

    const unsub1 = scope.onPageLayoutChange((event) => {
      if (event.pageIndex === pageIndex) {
        setLayout(event.layout);
      }
    });

    const unsub2 = scope.onStateChange((state) => {
      setPluginState(state);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [scope, pageIndex]);

  const layoutOverlayVisible = pluginState?.layoutOverlayVisible ?? true;
  const tableStructureOverlayVisible = pluginState?.tableStructureOverlayVisible ?? true;
  const layoutThreshold = pluginState?.layoutThreshold ?? 0.35;
  const tableStructureThreshold = pluginState?.tableStructureThreshold ?? 0.8;
  const selectedBlockId = pluginState?.selectedBlockId ?? null;

  const filteredBlocks = useMemo(() => {
    if (!layout || !layoutOverlayVisible) return [];
    return layout.blocks.filter((block) => block.score >= layoutThreshold);
  }, [layout, layoutOverlayVisible, layoutThreshold]);

  const handleBlockClick = useCallback(
    (blockId: string) => {
      layoutAnalysis?.selectBlock(selectedBlockId === blockId ? null : blockId);
    },
    [layoutAnalysis, selectedBlockId],
  );

  if (!layout || (!layoutOverlayVisible && !tableStructureOverlayVisible)) {
    return null;
  }

  const containerStyle: CSSProperties = {
    pointerEvents: 'none',
    ...style,
  };

  return (
    <div style={containerStyle} data-layout-analysis-layer="">
      {filteredBlocks.map((block) => (
        <BlockOverlay
          key={block.id}
          block={block}
          scale={actualScale}
          isSelected={selectedBlockId === block.id}
          onClick={handleBlockClick}
        />
      ))}

      {tableStructureOverlayVisible &&
        layout.tableStructures &&
        Array.from(layout.tableStructures.entries())
          .filter(([blockId]) => {
            const parent = layout.blocks.find((b) => b.id === blockId);
            return parent && parent.score >= layoutThreshold;
          })
          .map(([blockId, elements]) =>
            elements
              .filter((el) => el.score >= tableStructureThreshold)
              .map((el, idx) => (
                <TableStructureOverlay
                  key={`ts-${blockId}-${idx}`}
                  element={el}
                  scale={actualScale}
                />
              )),
          )}
    </div>
  );
}

function BlockOverlay({
  block,
  scale,
  isSelected,
  onClick,
}: {
  block: LayoutBlock;
  scale: number;
  isSelected: boolean;
  onClick: (id: string) => void;
}) {
  const blockStyle: CSSProperties = {
    position: 'absolute',
    left: block.rect.origin.x * scale,
    top: block.rect.origin.y * scale,
    width: block.rect.size.width * scale,
    height: block.rect.size.height * scale,
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
      style={blockStyle}
      data-block-id={block.id}
      data-block-label={block.label}
      onClick={() => onClick(block.id)}
    >
      <span style={labelStyle}>
        {block.label} {(block.score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function TableStructureOverlay({
  element,
  scale,
}: {
  element: TableStructureElement;
  scale: number;
}) {
  const elStyle: CSSProperties = {
    position: 'absolute',
    left: element.rect.origin.x * scale,
    top: element.rect.origin.y * scale,
    width: element.rect.size.width * scale,
    height: element.rect.size.height * scale,
    backgroundColor: TABLE_STRUCTURE_COLOR,
    border: `1px dashed ${TABLE_STRUCTURE_BORDER}`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };

  return <div style={elStyle} data-table-element={element.label} />;
}
