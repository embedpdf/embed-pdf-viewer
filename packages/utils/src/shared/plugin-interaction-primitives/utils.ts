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

export interface RotationUI {
  /** Handle size in px (default 16) */
  handleSize?: number;
  /** Distance from the center of the bounding box to the handle (default: calculated from rect) */
  radius?: number;
  /** z-index of the rotation handle (default 5) */
  zIndex?: number;
  /** Whether to show the connector line from center to handle (default true) */
  showConnector?: boolean;
  /** Connector line width in px (default 1) */
  connectorWidth?: number;
}

export interface HandleDescriptor {
  handle: ResizeHandle;
  style: Record<string, number | string>;
  attrs?: Record<string, any>;
}

export interface RotationHandleDescriptor {
  /** Style for the rotation handle itself */
  handleStyle: Record<string, number | string>;
  /** Style for the connector line (if shown) */
  connectorStyle: Record<string, number | string>;
  /** Attributes for the handle element */
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
    [edge]: edgeOffset(handleSize, spacing, offsetMode) + 'px',
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
      width: handleSize + 'px',
      height: handleSize + 'px',
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
        left: left + 'px',
        top: top + 'px',
        width: vertexSize + 'px',
        height: vertexSize + 'px',
        borderRadius: '50%',
        cursor: 'pointer',
        zIndex,
        touchAction: 'none',
      },
      attrs: { 'data-epdf-vertex': i },
    };
  });
}

/**
 * Describe the rotation handle position and style.
 * The rotation handle orbits around the center of the bounding box based on the current angle.
 *
 * @param cfg - The drag/resize config containing the element rect and scale
 * @param ui - UI customization options
 * @param currentAngle - The current rotation angle in degrees (0 = top, clockwise positive)
 */
export function describeRotationFromConfig(
  cfg: DragResizeConfig,
  ui: RotationUI = {},
  currentAngle: number = 0,
): RotationHandleDescriptor {
  const { handleSize = 16, zIndex = 5, showConnector = true, connectorWidth = 1 } = ui;

  const scale = cfg.scale ?? 1;
  const rect = cfg.element;

  // Calculate the center of the element (in scaled coordinates, relative to the element's origin)
  const scaledWidth = rect.size.width * scale;
  const scaledHeight = rect.size.height * scale;
  const centerX = scaledWidth / 2;
  const centerY = scaledHeight / 2;

  // Calculate radius - distance from center to handle
  // Default: slightly larger than the diagonal to ensure handle is outside the rect
  const defaultRadius = Math.max(scaledWidth, scaledHeight) / 2 + 30;
  const radius = ui.radius !== undefined ? ui.radius * scale : defaultRadius;

  // Convert angle to radians (0 degrees = top, positive = clockwise)
  // In CSS/screen coordinates: 0 deg points up (-Y), 90 deg points right (+X)
  const angleRad = ((currentAngle - 90) * Math.PI) / 180;

  // Calculate handle position (relative to element's top-left corner)
  const handleCenterX = centerX + radius * Math.cos(angleRad);
  const handleCenterY = centerY + radius * Math.sin(angleRad);
  const handleLeft = handleCenterX - handleSize / 2;
  const handleTop = handleCenterY - handleSize / 2;

  // Connector line from center to handle
  // We'll use a rotated line by setting its origin at center and rotating it
  const connectorLength = radius - handleSize / 2;

  return {
    handleStyle: {
      position: 'absolute',
      left: handleLeft + 'px',
      top: handleTop + 'px',
      width: handleSize + 'px',
      height: handleSize + 'px',
      borderRadius: '50%',
      cursor: 'grab',
      zIndex,
      touchAction: 'none',
    },
    connectorStyle: showConnector
      ? {
          position: 'absolute',
          left: centerX - connectorWidth / 2 + 'px',
          top: centerY + 'px',
          width: connectorWidth + 'px',
          height: connectorLength + 'px',
          transformOrigin: 'top center',
          transform: `rotate(${currentAngle}deg)`,
          zIndex: zIndex - 1,
          pointerEvents: 'none',
        }
      : {},
    attrs: { 'data-epdf-rotation-handle': true },
  };
}
