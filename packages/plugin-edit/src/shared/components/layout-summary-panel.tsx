import { useMemo, Fragment } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';
import { PdfLayoutSummary } from '@embedpdf/models';

type LayoutSummaryPanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  layoutSummary: PdfLayoutSummary;
  wordCount: number;
  lineCount: number;
  columnCount: number;
  tableCount: number;
  blockCount: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  style?: CSSProperties;
};

const positionStyles: Record<string, CSSProperties> = {
  'top-left': { top: 8, left: 8 },
  'top-right': { top: 8, right: 8 },
  'bottom-left': { bottom: 8, left: 8 },
  'bottom-right': { bottom: 8, right: 8 },
};

export function LayoutSummaryPanel({
  layoutSummary,
  wordCount,
  lineCount,
  columnCount,
  tableCount,
  blockCount,
  position = 'top-right',
  style,
  ...props
}: LayoutSummaryPanelProps) {
  const containerStyle: CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      ...positionStyles[position],
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: 1.5,
      minWidth: '180px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
      pointerEvents: 'auto',
      ...(style || {}),
    }),
    [position, style],
  );

  const { adaptiveParams } = layoutSummary;

  return (
    <div style={containerStyle} {...props}>
      <div
        style={{
          fontWeight: 600,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          fontSize: '13px',
        }}
      >
        Layout Summary
      </div>

      {/* Counts Section */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Words:</span>
          <span style={{ fontWeight: 500 }}>{wordCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Lines:</span>
          <span style={{ fontWeight: 500 }}>{lineCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Columns:</span>
          <span style={{ fontWeight: 500 }}>{columnCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Tables:</span>
          <span style={{ fontWeight: 500 }}>{tableCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Blocks:</span>
          <span style={{ fontWeight: 500 }}>{blockCount}</span>
        </div>
      </div>

      {/* Adaptive Parameters Section */}
      <div
        style={{
          paddingTop: 8,
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.5)',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Adaptive Parameters
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Median H:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
            {adaptiveParams.medianHeight.toFixed(2)} pt
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Median W:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
            {adaptiveParams.medianWidth.toFixed(2)} pt
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Baseline Tol:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
            {adaptiveParams.baselineTolerance.toFixed(2)} pt
          </span>
        </div>
      </div>
    </div>
  );
}
