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

  private calculateResizePosition(delta: Position, handle: ResizeHandle): Rect {
    if (!this.startElement) return this.config.element;

    let {
      origin: { x, y },
      size: { width, height },
    } = this.startElement;

    switch (handle) {
      case 'se':
        width += delta.x;
        height += delta.y;
        break;
      case 'sw':
        x += delta.x;
        width -= delta.x;
        height += delta.y;
        break;
      case 'ne':
        width += delta.x;
        y += delta.y;
        height -= delta.y;
        break;
      case 'nw':
        x += delta.x;
        width -= delta.x;
        y += delta.y;
        height -= delta.y;
        break;
      case 'n':
        y += delta.y;
        height -= delta.y;
        break;
      case 's':
        height += delta.y;
        break;
      case 'e':
        width += delta.x;
        break;
      case 'w':
        x += delta.x;
        width -= delta.x;
        break;
    }

    // Maintain aspect ratio if needed
    if (this.config.maintainAspectRatio && this.startElement) {
      const aspectRatio = this.startElement.size.width / this.startElement.size.height;

      if (['n', 's', 'e', 'w'].includes(handle)) {
        if (handle === 'n' || handle === 's') {
          const newWidth = height * aspectRatio;
          const widthDiff = newWidth - width;
          width = newWidth;
          x -= widthDiff / 2;
        } else {
          const newHeight = width / aspectRatio;
          const heightDiff = newHeight - height;
          height = newHeight;
          if (handle === 'w') {
            x = this.startElement.origin.x + this.startElement.size.width - width;
          }
          y -= heightDiff / 2;
        }
      } else {
        const widthChange = Math.abs(width - this.startElement.size.width);
        const heightChange = Math.abs(height - this.startElement.size.height);
        if (widthChange > heightChange) {
          height = width / aspectRatio;
        } else {
          width = height * aspectRatio;
        }
        if (handle.includes('w')) {
          x = this.startElement.origin.x + this.startElement.size.width - width;
        }
        if (handle.includes('n')) {
          y = this.startElement.origin.y + this.startElement.size.height - height;
        }
      }
    }

    // Handle-aware bounding box clamping to avoid shifting opposite edge
    const bbox = this.config.constraints?.boundingBox;
    if (bbox) {
      switch (handle) {
        case 'e':
          width = Math.min(width, bbox.width - x);
          break;
        case 's':
          height = Math.min(height, bbox.height - y);
          break;
        case 'se':
          width = Math.min(width, bbox.width - x);
          height = Math.min(height, bbox.height - y);
          break;
        case 'w':
          if (x < 0) {
            width += x;
            x = 0;
          }
          break;
        case 'n':
          if (y < 0) {
            height += y;
            y = 0;
          }
          break;
        case 'sw':
          if (x < 0) {
            width += x;
            x = 0;
          }
          height = Math.min(height, bbox.height - y);
          break;
        case 'nw':
          if (x < 0) {
            width += x;
            x = 0;
          }
          if (y < 0) {
            height += y;
            y = 0;
          }
          break;
        case 'ne':
          width = Math.min(width, bbox.width - x);
          if (y < 0) {
            height += y;
            y = 0;
          }
          break;
      }
    }

    return this.applyConstraints({ origin: { x, y }, size: { width, height } });
  }

  private applyConstraints(position: Rect): Rect {
    const { constraints } = this.config;
    if (!constraints) return position;

    let {
      origin: { x, y },
      size: { width, height },
    } = position;

    // Apply size constraints
    width = Math.max(constraints.minWidth || 1, width);
    height = Math.max(constraints.minHeight || 1, height);

    if (constraints.maxWidth) width = Math.min(constraints.maxWidth, width);
    if (constraints.maxHeight) height = Math.min(constraints.maxHeight, height);

    // Apply bounding box constraints
    if (constraints.boundingBox) {
      x = Math.max(0, Math.min(x, constraints.boundingBox.width - width));
      y = Math.max(0, Math.min(y, constraints.boundingBox.height - height));
    }

    return { origin: { x, y }, size: { width, height } };
  }
}
