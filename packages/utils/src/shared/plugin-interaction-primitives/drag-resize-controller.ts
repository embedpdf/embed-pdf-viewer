import { Position, Rect } from '@embedpdf/models';

export interface DragResizeConfig {
  element: Rect;
  vertices?: Position[];
  constraints?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    boundingBox?: { width: number; height: number }; // page bounds
  };
  maintainAspectRatio?: boolean;
  pageRotation?: number;
  scale?: number;
}

export type InteractionState = 'idle' | 'dragging' | 'resizing' | 'vertex-editing';
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';

export interface TransformData {
  type: 'move' | 'resize' | 'vertex-edit';
  changes: {
    rect?: Rect;
    vertices?: Position[];
  };
  metadata?: {
    handle?: ResizeHandle;
    vertexIndex?: number;
    maintainAspectRatio?: boolean;
  };
}

export interface InteractionEvent {
  state: 'start' | 'move' | 'end';
  transformData?: TransformData;
}

/** Anchor describes which edges stay fixed when resizing. */
type Anchor = {
  x: 'left' | 'right' | 'center';
  y: 'top' | 'bottom' | 'center';
};

/**
 * Derive anchor from handle.
 * - 'e' means we're dragging east → left edge is anchored
 * - 'nw' means we're dragging north-west → bottom-right corner is anchored
 */
function getAnchor(handle: ResizeHandle): Anchor {
  return {
    x: handle.includes('e') ? 'left' : handle.includes('w') ? 'right' : 'center',
    y: handle.includes('s') ? 'top' : handle.includes('n') ? 'bottom' : 'center',
  };
}

/**
 * Pure geometric controller that manages drag/resize/vertex-edit logic.
 */
export class DragResizeController {
  private state: InteractionState = 'idle';
  private startPoint: Position | null = null;
  private startElement: Rect | null = null;
  private activeHandle: ResizeHandle | null = null;
  private currentPosition: Rect | null = null;

  // Vertex editing state - pure geometric
  private activeVertexIndex: number | null = null;
  private startVertices: Position[] = [];
  private currentVertices: Position[] = [];

  constructor(
    private config: DragResizeConfig,
    private onUpdate: (event: InteractionEvent) => void,
  ) {
    this.currentVertices = config.vertices || [];
  }

  updateConfig(config: Partial<DragResizeConfig>) {
    this.config = { ...this.config, ...config };
    this.currentVertices = config.vertices || [];
  }

  startDrag(clientX: number, clientY: number) {
    this.state = 'dragging';
    this.startPoint = { x: clientX, y: clientY };
    this.startElement = { ...this.config.element };
    this.currentPosition = { ...this.config.element };

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'move',
        changes: {
          rect: this.startElement,
        },
      },
    });
  }

  startResize(handle: ResizeHandle, clientX: number, clientY: number) {
    this.state = 'resizing';
    this.activeHandle = handle;
    this.startPoint = { x: clientX, y: clientY };
    this.startElement = { ...this.config.element };
    this.currentPosition = { ...this.config.element };

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'resize',
        changes: {
          rect: this.startElement,
        },
        metadata: {
          handle: this.activeHandle,
          maintainAspectRatio: this.config.maintainAspectRatio,
        },
      },
    });
  }

  startVertexEdit(vertexIndex: number, clientX: number, clientY: number) {
    // Refresh vertices from latest config before validating index
    this.currentVertices = [...(this.config.vertices ?? this.currentVertices)];
    if (vertexIndex < 0 || vertexIndex >= this.currentVertices.length) return;

    this.state = 'vertex-editing';
    this.activeVertexIndex = vertexIndex;
    this.startPoint = { x: clientX, y: clientY };
    this.startVertices = [...this.currentVertices];

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'vertex-edit',
        changes: {
          vertices: this.startVertices,
        },
        metadata: {
          vertexIndex,
        },
      },
    });
  }

  move(clientX: number, clientY: number) {
    if (this.state === 'idle' || !this.startPoint) return;

    if (this.state === 'dragging' && this.startElement) {
      const delta = this.calculateDelta(clientX, clientY);
      const position = this.calculateDragPosition(delta);
      this.currentPosition = position;

      this.onUpdate({
        state: 'move',
        transformData: {
          type: 'move',
          changes: {
            rect: position,
          },
        },
      });
    } else if (this.state === 'resizing' && this.activeHandle && this.startElement) {
      const delta = this.calculateDelta(clientX, clientY);
      const position = this.calculateResizePosition(delta, this.activeHandle);
      this.currentPosition = position;

      this.onUpdate({
        state: 'move',
        transformData: {
          type: 'resize',
          changes: {
            rect: position,
          },
          metadata: {
            handle: this.activeHandle,
            maintainAspectRatio: this.config.maintainAspectRatio,
          },
        },
      });
    } else if (this.state === 'vertex-editing' && this.activeVertexIndex !== null) {
      const vertices = this.calculateVertexPosition(clientX, clientY);
      this.currentVertices = vertices;

      this.onUpdate({
        state: 'move',
        transformData: {
          type: 'vertex-edit',
          changes: {
            vertices,
          },
          metadata: {
            vertexIndex: this.activeVertexIndex,
          },
        },
      });
    }
  }

  end() {
    if (this.state === 'idle') return;

    const wasState = this.state;
    const handle = this.activeHandle;
    const vertexIndex = this.activeVertexIndex;

    if (wasState === 'vertex-editing') {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'vertex-edit',
          changes: {
            vertices: this.currentVertices,
          },
          metadata: {
            vertexIndex: vertexIndex || undefined,
          },
        },
      });
    } else {
      const finalPosition = this.getCurrentPosition();
      this.onUpdate({
        state: 'end',
        transformData: {
          type: wasState === 'dragging' ? 'move' : 'resize',
          changes: {
            rect: finalPosition,
          },
          metadata:
            wasState === 'dragging'
              ? undefined
              : {
                  handle: handle || undefined,
                  maintainAspectRatio: this.config.maintainAspectRatio,
                },
        },
      });
    }

    this.reset();
  }

  cancel() {
    if (this.state === 'idle') return;

    if (this.state === 'vertex-editing') {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'vertex-edit',
          changes: {
            vertices: this.startVertices,
          },
          metadata: {
            vertexIndex: this.activeVertexIndex || undefined,
          },
        },
      });
    } else if (this.startElement) {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: this.state === 'dragging' ? 'move' : 'resize',
          changes: {
            rect: this.startElement,
          },
          metadata:
            this.state === 'dragging'
              ? undefined
              : {
                  handle: this.activeHandle || undefined,
                  maintainAspectRatio: this.config.maintainAspectRatio,
                },
        },
      });
    }

    this.reset();
  }

  private reset() {
    this.state = 'idle';
    this.startPoint = null;
    this.startElement = null;
    this.activeHandle = null;
    this.currentPosition = null;
    this.activeVertexIndex = null;
    this.startVertices = [];
  }

  private getCurrentPosition() {
    return this.currentPosition || this.config.element;
  }

  private calculateDelta(clientX: number, clientY: number): Position {
    if (!this.startPoint) return { x: 0, y: 0 };

    const rawDelta: Position = {
      x: clientX - this.startPoint.x,
      y: clientY - this.startPoint.y,
    };

    return this.transformDelta(rawDelta);
  }

  private transformDelta(delta: Position): Position {
    const { pageRotation = 0, scale = 1 } = this.config;

    const rad = (pageRotation * Math.PI) / 2;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const scaledX = delta.x / scale;
    const scaledY = delta.y / scale;

    return {
      x: cos * scaledX + sin * scaledY,
      y: -sin * scaledX + cos * scaledY,
    };
  }

  private clampPoint(p: Position): Position {
    const bbox = this.config.constraints?.boundingBox;
    if (!bbox) return p;
    return {
      x: Math.max(0, Math.min(p.x, bbox.width)),
      y: Math.max(0, Math.min(p.y, bbox.height)),
    };
  }

  private calculateVertexPosition(clientX: number, clientY: number): Position[] {
    if (this.activeVertexIndex === null) return this.startVertices;

    const delta = this.calculateDelta(clientX, clientY);
    const newVertices = [...this.startVertices];
    const currentVertex = newVertices[this.activeVertexIndex];

    const moved = {
      x: currentVertex.x + delta.x,
      y: currentVertex.y + delta.y,
    };
    newVertices[this.activeVertexIndex] = this.clampPoint(moved);

    return newVertices;
  }

  private calculateDragPosition(delta: Position): Rect {
    if (!this.startElement) return this.config.element;

    const position: Rect = {
      origin: {
        x: this.startElement.origin.x + delta.x,
        y: this.startElement.origin.y + delta.y,
      },
      size: {
        width: this.startElement.size.width,
        height: this.startElement.size.height,
      },
    };

    return this.applyConstraints(position);
  }

  /**
   * Calculate the new rect after a resize operation.
   * Pipeline: applyDelta → enforceAspectRatio → clampToBounds → applyConstraints
   */
  private calculateResizePosition(delta: Position, handle: ResizeHandle): Rect {
    if (!this.startElement) return this.config.element;

    const anchor = getAnchor(handle);
    const aspectRatio = this.startElement.size.width / this.startElement.size.height || 1;

    // Step 1: Apply delta to get raw resize
    let rect = this.applyResizeDelta(delta, anchor);

    // Step 2: Enforce aspect ratio if enabled
    if (this.config.maintainAspectRatio) {
      rect = this.enforceAspectRatio(rect, anchor, aspectRatio);
    }

    // Step 3: Clamp to bounding box
    rect = this.clampToBounds(rect, anchor, aspectRatio);

    // Step 4: Apply min/max constraints
    return this.applyConstraints(rect);
  }

  /**
   * Apply the mouse delta to produce a raw (unconstrained) resized rect.
   */
  private applyResizeDelta(delta: Position, anchor: Anchor): Rect {
    const start = this.startElement!;
    let x = start.origin.x;
    let y = start.origin.y;
    let width = start.size.width;
    let height = start.size.height;

    // Horizontal: if anchor is left, right edge moves; if anchor is right, left edge moves
    if (anchor.x === 'left') {
      width += delta.x;
    } else if (anchor.x === 'right') {
      x += delta.x;
      width -= delta.x;
    }
    // anchor.x === 'center' means no horizontal resize from this handle

    // Vertical: if anchor is top, bottom edge moves; if anchor is bottom, top edge moves
    if (anchor.y === 'top') {
      height += delta.y;
    } else if (anchor.y === 'bottom') {
      y += delta.y;
      height -= delta.y;
    }

    return { origin: { x, y }, size: { width, height } };
  }

  /**
   * Enforce aspect ratio while respecting the anchor.
   * For edge handles (center anchor on one axis), the rect expands symmetrically on that axis.
   * For corner handles, the anchor corner stays fixed.
   */
  private enforceAspectRatio(rect: Rect, anchor: Anchor, aspectRatio: number): Rect {
    const start = this.startElement!;
    let { x, y } = rect.origin;
    let { width, height } = rect.size;

    const isEdgeHandle = anchor.x === 'center' || anchor.y === 'center';

    if (isEdgeHandle) {
      // Edge handle: one dimension drives, the other follows, centered on the non-moving axis
      if (anchor.y === 'center') {
        // Horizontal edge (e/w): width is primary
        height = width / aspectRatio;
        // Center vertically relative to original
        y = start.origin.y + (start.size.height - height) / 2;
      } else {
        // Vertical edge (n/s): height is primary
        width = height * aspectRatio;
        // Center horizontally relative to original
        x = start.origin.x + (start.size.width - width) / 2;
      }
    } else {
      // Corner handle: pick the dominant axis based on which changed more
      const dw = Math.abs(width - start.size.width);
      const dh = Math.abs(height - start.size.height);

      if (dw >= dh) {
        height = width / aspectRatio;
      } else {
        width = height * aspectRatio;
      }
    }

    // Reposition based on anchor
    if (anchor.x === 'right') {
      x = start.origin.x + start.size.width - width;
    }
    if (anchor.y === 'bottom') {
      y = start.origin.y + start.size.height - height;
    }

    return { origin: { x, y }, size: { width, height } };
  }

  /**
   * Clamp rect to bounding box while respecting anchor and aspect ratio.
   */
  private clampToBounds(rect: Rect, anchor: Anchor, aspectRatio: number): Rect {
    const bbox = this.config.constraints?.boundingBox;
    if (!bbox) return rect;

    const start = this.startElement!;
    let { x, y } = rect.origin;
    let { width, height } = rect.size;

    // Ensure positive dimensions
    width = Math.max(1, width);
    height = Math.max(1, height);

    // Calculate anchor points (the edges/corners that must stay fixed)
    const anchorX = anchor.x === 'left' ? start.origin.x : start.origin.x + start.size.width;
    const anchorY = anchor.y === 'top' ? start.origin.y : start.origin.y + start.size.height;

    // Calculate max available space from anchor
    const maxW =
      anchor.x === 'left'
        ? bbox.width - anchorX
        : anchor.x === 'right'
          ? anchorX
          : Math.min(start.origin.x, bbox.width - start.origin.x - start.size.width) * 2 +
            start.size.width;

    const maxH =
      anchor.y === 'top'
        ? bbox.height - anchorY
        : anchor.y === 'bottom'
          ? anchorY
          : Math.min(start.origin.y, bbox.height - start.origin.y - start.size.height) * 2 +
            start.size.height;

    if (this.config.maintainAspectRatio) {
      // Find the scaling factor that fits both constraints
      const scaleW = width > maxW ? maxW / width : 1;
      const scaleH = height > maxH ? maxH / height : 1;
      const scale = Math.min(scaleW, scaleH);

      if (scale < 1) {
        width *= scale;
        height *= scale;
      }
    } else {
      // Clamp independently
      width = Math.min(width, maxW);
      height = Math.min(height, maxH);
    }

    // Recompute position based on anchor
    if (anchor.x === 'left') {
      x = anchorX;
    } else if (anchor.x === 'right') {
      x = anchorX - width;
    } else {
      x = start.origin.x + (start.size.width - width) / 2;
    }

    if (anchor.y === 'top') {
      y = anchorY;
    } else if (anchor.y === 'bottom') {
      y = anchorY - height;
    } else {
      y = start.origin.y + (start.size.height - height) / 2;
    }

    // Final clamp to ensure we're within bounds (handles center anchor edge cases)
    x = Math.max(0, Math.min(x, bbox.width - width));
    y = Math.max(0, Math.min(y, bbox.height - height));

    return { origin: { x, y }, size: { width, height } };
  }

  private applyConstraints(position: Rect): Rect {
    const { constraints } = this.config;
    if (!constraints) return position;

    let {
      origin: { x, y },
      size: { width, height },
    } = position;

    const minW = constraints.minWidth ?? 1;
    const minH = constraints.minHeight ?? 1;
    const maxW = constraints.maxWidth;
    const maxH = constraints.maxHeight;

    if (this.config.maintainAspectRatio && width > 0 && height > 0) {
      const ratio = width / height;

      // Enforce mins (scale up)
      if (width < minW) {
        width = minW;
        height = width / ratio;
      }
      if (height < minH) {
        height = minH;
        width = height * ratio;
      }

      // Enforce maxes (scale down)
      if (maxW !== undefined && width > maxW) {
        width = maxW;
        height = width / ratio;
      }
      if (maxH !== undefined && height > maxH) {
        height = maxH;
        width = height * ratio;
      }
    } else {
      width = Math.max(minW, width);
      height = Math.max(minH, height);
      if (maxW !== undefined) width = Math.min(maxW, width);
      if (maxH !== undefined) height = Math.min(maxH, height);
    }

    // Clamp position to bounding box
    if (constraints.boundingBox) {
      x = Math.max(0, Math.min(x, constraints.boundingBox.width - width));
      y = Math.max(0, Math.min(y, constraints.boundingBox.height - height));
    }

    return { origin: { x, y }, size: { width, height } };
  }
}
