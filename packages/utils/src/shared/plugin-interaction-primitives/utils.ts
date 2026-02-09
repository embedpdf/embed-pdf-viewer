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

/** Screen-pixel gap between the rect edge and the rotation handle center (default orbit margin). */
export const ROTATION_HANDLE_MARGIN = 30;

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
  /** Orbit radius in screen pixels used to position the handle. */
  radius: number;
  /** Attributes for the handle element */
  attrs?: Record<string, any>;
}

/**
 * Base angle (degrees, clockwise from north) for each resize handle.
 * Used to compute the effective angle after page + annotation rotation.
 */
const HANDLE_BASE_ANGLE: Record<ResizeHandle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};

/**
 * Cursor names mapped to 45-degree sectors.
 * Sector 0 = north (337.5..22.5), sector 1 = NE (22.5..67.5), etc.
 */
const SECTOR_CURSORS: string[] = [
  'ns-resize', // 0: north
  'nesw-resize', // 1: NE
  'ew-resize', // 2: east
  'nwse-resize', // 3: SE
  'ns-resize', // 4: south
  'nesw-resize', // 5: SW
  'ew-resize', // 6: west
  'nwse-resize', // 7: NW
];

function diagonalCursor(
  handle: ResizeHandle,
  pageQuarterTurns: QuarterTurns,
  annotationRotation: number = 0,
): string {
  const pageAngle = pageQuarterTurns * 90;
  const totalAngle = HANDLE_BASE_ANGLE[handle] + pageAngle + annotationRotation;
  // Normalize to [0, 360)
  const normalized = ((totalAngle % 360) + 360) % 360;
  // Map to 45-degree sector (0..7)
  const sector = Math.round(normalized / 45) % 8;
  return SECTOR_CURSORS[sector];
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

  const pageQuarterTurns = ((cfg.pageRotation ?? 0) % 4) as QuarterTurns;
  const annotationRot = cfg.annotationRotation ?? 0;

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
      cursor: rotationAwareCursor
        ? diagonalCursor(handle, pageQuarterTurns, annotationRot)
        : 'default',
      pointerEvents: 'auto',
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
        pointerEvents: 'auto',
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

  const orbitRect = cfg.rotationElement ?? rect;
  const orbitCenter = cfg.rotationCenter ?? {
    x: rect.origin.x + rect.size.width / 2,
    y: rect.origin.y + rect.size.height / 2,
  };

  // Center in scaled coordinates, relative to the orbit rect's origin.
  const scaledWidth = orbitRect.size.width * scale;
  const scaledHeight = orbitRect.size.height * scale;
  const centerX = (orbitCenter.x - orbitRect.origin.x) * scale;
  const centerY = (orbitCenter.y - orbitRect.origin.y) * scale;

  // Calculate radius - distance from center to handle
  // Default: far enough from center so the handle clears the rect at any angle
  const defaultRadius = Math.max(scaledWidth, scaledHeight) / 2 + ROTATION_HANDLE_MARGIN;
  const radius = ui.radius !== undefined ? ui.radius * scale : defaultRadius;

  // Handle orbits at currentAngle (0° = top, clockwise positive)
  const angleRad = (currentAngle * Math.PI) / 180;
  const handleCenterX = centerX + radius * Math.sin(angleRad);
  const handleCenterY = centerY - radius * Math.cos(angleRad);
  const handleLeft = handleCenterX - handleSize / 2;
  const handleTop = handleCenterY - handleSize / 2;

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
      pointerEvents: 'auto',
      touchAction: 'none',
    },
    connectorStyle: showConnector
      ? {
          position: 'absolute',
          left: centerX - connectorWidth / 2 + 'px',
          top: centerY - radius + 'px',
          width: connectorWidth + 'px',
          height: radius + 'px',
          transformOrigin: 'center bottom',
          transform: `rotate(${currentAngle}deg)`,
          zIndex: zIndex - 1,
          pointerEvents: 'none',
        }
      : {},
    radius,
    attrs: { 'data-epdf-rotation-handle': true },
  };
}
