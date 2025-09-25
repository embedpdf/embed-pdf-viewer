import type { Position, Rect } from '@embedpdf/models';
import type { ResizeHandle, DragResizeConfig } from './drag-resize-controller';

export type QuarterTurns = 0 | 1 | 2 | 3;

export interface ResizeUI {
  handleSize?: number; // px (default 8)
  spacing?: number; // px distance from the box edge (default 1)
  offsetMode?: 'outside' | 'inside' | 'center'; // default 'outside'
  includeSides?: boolean; // default false
  zIndex?: number; // default 3
  rotationAwareCursor?: boolean; // default true
}

export interface VertexUI {
  vertexSize?: number; // px (default 12)
  zIndex?: number; // default 4
}

export interface HandleDescriptor {
  handle: ResizeHandle;
  style: Record<string, number | string>;
  attrs?: Record<string, any>;
}

function diagonalCursor(handle: ResizeHandle, rot: QuarterTurns): string {
  // Standard cursors; diagonals flip on odd quarter-turns
  const diag0: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
    nw: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    se: 'nwse-resize',
  };
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (rot % 2 === 0) return diag0[handle as 'nw' | 'ne' | 'sw' | 'se'];
  return { nw: 'nesw-resize', ne: 'nwse-resize', sw: 'nwse-resize', se: 'nesw-resize' }[
    handle as 'nw' | 'ne' | 'sw' | 'se'
  ]!;
}

function edgeOffset(k: number, spacing: number, mode: 'outside' | 'inside' | 'center') {
  // Base puts the handle centered on the edge
  const base = -k / 2;
  if (mode === 'center') return base;
  // outside moves further out (more negative), inside moves in (less negative)
  return mode === 'outside' ? base - spacing : base + spacing;
}

export function describeResizeFromConfig(
  cfg: DragResizeConfig,
  ui: ResizeUI = {},
): HandleDescriptor[] {
  const {
    handleSize = 8,
    spacing = 1,
    offsetMode = 'outside',
    includeSides = false,
    zIndex = 3,
    rotationAwareCursor = true,
  } = ui;

  const rotation = ((cfg.pageRotation ?? 0) % 4) as QuarterTurns;

  const off = (edge: 'top' | 'right' | 'bottom' | 'left') => ({
    [edge]: edgeOffset(handleSize, spacing, offsetMode),
  });

  const corners: Array<[ResizeHandle, Record<string, number | string>]> = [
    ['nw', { ...off('top'), ...off('left') }],
    ['ne', { ...off('top'), ...off('right') }],
    ['sw', { ...off('bottom'), ...off('left') }],
    ['se', { ...off('bottom'), ...off('right') }],
  ];
  const sides: Array<[ResizeHandle, Record<string, number | string>]> = includeSides
    ? [
        ['n', { ...off('top'), left: `calc(50% - ${handleSize / 2}px)` }],
        ['s', { ...off('bottom'), left: `calc(50% - ${handleSize / 2}px)` }],
        ['w', { ...off('left'), top: `calc(50% - ${handleSize / 2}px)` }],
        ['e', { ...off('right'), top: `calc(50% - ${handleSize / 2}px)` }],
      ]
    : [];

  const all = [...corners, ...sides];

  return all.map(([handle, pos]) => ({
    handle,
    style: {
      position: 'absolute',
      width: handleSize,
      height: handleSize,
      borderRadius: '50%',
      zIndex,
      cursor: rotationAwareCursor ? diagonalCursor(handle, rotation) : 'default',
      touchAction: 'none',
      ...(pos as any),
    },
    attrs: { 'data-epdf-handle': handle },
  }));
}

export function describeVerticesFromConfig(
  cfg: DragResizeConfig,
  ui: VertexUI = {},
  liveVertices?: Position[],
): HandleDescriptor[] {
  const { vertexSize = 12, zIndex = 4 } = ui;
  const rect: Rect = cfg.element;
  const scale = cfg.scale ?? 1;
  const verts = liveVertices ?? cfg.vertices ?? [];

  return verts.map((v, i) => {
    const left = (v.x - rect.origin.x) * scale - vertexSize / 2;
    const top = (v.y - rect.origin.y) * scale - vertexSize / 2;
    return {
      handle: 'nw', // not used; kept for type
      style: {
        position: 'absolute',
        left,
        top,
        width: vertexSize,
        height: vertexSize,
        borderRadius: '50%',
        cursor: 'pointer',
        zIndex,
        touchAction: 'none',
      },
      attrs: { 'data-epdf-vertex': i },
    };
  });
}
