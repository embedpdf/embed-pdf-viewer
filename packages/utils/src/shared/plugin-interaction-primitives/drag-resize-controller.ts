import { Position, Rect, rotatePointAround, normalizeAngle } from '@embedpdf/models';
import { ROTATION_HANDLE_MARGIN } from './utils';
import { computeResizedRect, applyConstraints } from './resize-geometry';

export interface DragResizeConfig {
  element: Rect;
  /**
   * Optional world-space pivot to use for rotation interactions.
   * Defaults to the center of `element`.
   */
  rotationCenter?: Position;
  /**
   * Optional rect used for rotation-handle orbit layout (typically the visible AABB container).
   * Defaults to `element`.
   */
  rotationElement?: Rect;
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
  /** Rotation of the annotation itself in degrees (used to project mouse deltas into local space for resize/vertex-edit) */
  annotationRotation?: number;
  scale?: number;
  rotationSnapAngles?: number[];
  rotationSnapThreshold?: number;
}

export type InteractionState = 'idle' | 'dragging' | 'resizing' | 'vertex-editing' | 'rotating';
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';

export interface TransformData {
  type: 'move' | 'resize' | 'vertex-edit' | 'rotate';
  changes: {
    rect?: Rect;
    vertices?: Position[];
    rotation?: number;
  };
  metadata?: {
    handle?: ResizeHandle;
    vertexIndex?: number;
    maintainAspectRatio?: boolean;
    /** The rotation angle in degrees */
    rotationAngle?: number;
    /** The center point used for rotation */
    rotationCenter?: Position;
    rotationDelta?: number;
    isSnapped?: boolean;
    snappedAngle?: number;
    /** Screen-space cursor position during the gesture */
    cursorPosition?: { clientX: number; clientY: number };
  };
}

export interface InteractionEvent {
  state: 'start' | 'move' | 'end';
  transformData?: TransformData;
}

/**
 * Pure geometric controller that manages drag/resize/vertex-edit/rotate logic.
 */
export class DragResizeController {
  private state: InteractionState = 'idle';
  private startPoint: Position | null = null;
  private startElement: Rect | null = null;
  private startRotationElement: Rect | null = null;
  private gestureRotationCenter: Position | null = null;
  private activeHandle: ResizeHandle | null = null;
  private currentPosition: Rect | null = null;

  // Vertex editing state - pure geometric
  private activeVertexIndex: number | null = null;
  private startVertices: Position[] = [];
  private currentVertices: Position[] = [];

  // Rotation state
  private rotationCenter: Position | null = null;
  private centerScreen: Position | null = null; // Cached center in screen coords
  private initialRotation: number = 0; // The rotation value when interaction started
  private lastComputedRotation: number = 0; // The last computed rotation during move
  private rotationDelta: number = 0;
  private rotationSnappedAngle: number | null = null;

  constructor(
    private config: DragResizeConfig,
    private onUpdate: (event: InteractionEvent) => void,
  ) {
    this.currentVertices = config.vertices || [];
  }

  updateConfig(config: Partial<DragResizeConfig>) {
    this.config = { ...this.config, ...config };
    // Keep the gesture buffer stable during active vertex editing.
    // Otherwise rerendered preview vertices can overwrite `currentVertices`
    // and cause end() to emit compensated vertices a second time.
    if (this.state !== 'vertex-editing') {
      this.currentVertices = config.vertices || [];
    }
  }

  // ---------------------------------------------------------------------------
  // Gesture start
  // ---------------------------------------------------------------------------

  startDrag(clientX: number, clientY: number) {
    this.state = 'dragging';
    this.startPoint = { x: clientX, y: clientY };
    this.startElement = { ...this.config.element };
    this.startRotationElement = this.config.rotationElement
      ? { ...this.config.rotationElement }
      : null;
    this.currentPosition = { ...this.config.element };

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'move',
        changes: { rect: this.startElement },
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
        changes: { rect: this.startElement },
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
    this.gestureRotationCenter = this.config.rotationCenter ?? {
      x: this.config.element.origin.x + this.config.element.size.width / 2,
      y: this.config.element.origin.y + this.config.element.size.height / 2,
    };

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'vertex-edit',
        changes: { vertices: this.startVertices },
        metadata: { vertexIndex },
      },
    });
  }

  startRotation(
    clientX: number,
    clientY: number,
    initialRotation: number = 0,
    orbitRadiusPx?: number,
  ) {
    this.state = 'rotating';
    this.startPoint = { x: clientX, y: clientY };
    this.startElement = { ...this.config.element };

    // Use explicit rotation center when provided (keeps pivot stable after vertex edits).
    this.rotationCenter = this.config.rotationCenter ?? {
      x: this.config.element.origin.x + this.config.element.size.width / 2,
      y: this.config.element.origin.y + this.config.element.size.height / 2,
    };

    // Cache the center in screen coordinates, derived from the handle's DOM center
    const { scale = 1 } = this.config;
    const orbitRect = this.config.rotationElement ?? this.config.element;
    const sw = orbitRect.size.width * scale;
    const sh = orbitRect.size.height * scale;
    const radius = orbitRadiusPx ?? Math.max(sw, sh) / 2 + ROTATION_HANDLE_MARGIN;
    const pageRotOffset = (this.config.pageRotation ?? 0) * 90;
    const screenAngleRad = ((initialRotation + pageRotOffset) * Math.PI) / 180;
    this.centerScreen = {
      x: clientX - radius * Math.sin(screenAngleRad),
      y: clientY + radius * Math.cos(screenAngleRad),
    };

    this.initialRotation = initialRotation;
    this.lastComputedRotation = initialRotation;
    this.rotationDelta = 0;
    this.rotationSnappedAngle = null;

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'rotate',
        changes: { rotation: initialRotation },
        metadata: {
          rotationAngle: initialRotation,
          rotationDelta: 0,
          rotationCenter: this.rotationCenter,
          isSnapped: false,
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Gesture move
  // ---------------------------------------------------------------------------

  move(clientX: number, clientY: number, buttons?: number) {
    if (this.state === 'idle' || !this.startPoint) return;

    // Safety net: if the button is no longer pressed but we never received
    // pointerup/pointercancel, finalize the gesture to avoid a "stuck" drag.
    if (buttons !== undefined && buttons === 0) {
      this.end();
      return;
    }

    if (this.state === 'dragging' && this.startElement) {
      const delta = this.calculateDelta(clientX, clientY);
      const position = this.calculateDragPosition(delta);
      this.currentPosition = position;

      this.onUpdate({
        state: 'move',
        transformData: { type: 'move', changes: { rect: position } },
      });
    } else if (this.state === 'resizing' && this.activeHandle && this.startElement) {
      const delta = this.calculateLocalDelta(clientX, clientY);
      const position = computeResizedRect(delta, this.activeHandle, {
        startRect: this.startElement,
        maintainAspectRatio: this.config.maintainAspectRatio,
        annotationRotation: this.config.annotationRotation,
        constraints: this.config.constraints,
      });
      this.currentPosition = position;

      this.onUpdate({
        state: 'move',
        transformData: {
          type: 'resize',
          changes: { rect: position },
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
          changes: { vertices },
          metadata: { vertexIndex: this.activeVertexIndex },
        },
      });
    } else if (this.state === 'rotating' && this.rotationCenter) {
      const absoluteAngle = this.calculateAngleFromMouse(clientX, clientY);
      const snapResult = this.applyRotationSnapping(absoluteAngle);
      const snappedAngle = normalizeAngle(snapResult.angle);
      const previousAngle = this.lastComputedRotation;
      const rawDelta = snappedAngle - previousAngle;
      const adjustedDelta =
        rawDelta > 180 ? rawDelta - 360 : rawDelta < -180 ? rawDelta + 360 : rawDelta;

      this.rotationDelta += adjustedDelta;
      this.lastComputedRotation = snappedAngle;
      this.rotationSnappedAngle = snapResult.isSnapped ? snappedAngle : null;

      this.onUpdate({
        state: 'move',
        transformData: {
          type: 'rotate',
          changes: { rotation: snappedAngle },
          metadata: {
            rotationAngle: snappedAngle,
            rotationDelta: this.rotationDelta,
            rotationCenter: this.rotationCenter,
            isSnapped: snapResult.isSnapped,
            snappedAngle: this.rotationSnappedAngle ?? undefined,
            cursorPosition: { clientX, clientY },
          },
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Gesture end / cancel
  // ---------------------------------------------------------------------------

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
          changes: { vertices: this.currentVertices },
          metadata: { vertexIndex: vertexIndex || undefined },
        },
      });
    } else if (wasState === 'rotating') {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'rotate',
          changes: { rotation: this.lastComputedRotation },
          metadata: {
            rotationAngle: this.lastComputedRotation,
            rotationDelta: this.rotationDelta,
            rotationCenter: this.rotationCenter || undefined,
            isSnapped: this.rotationSnappedAngle !== null,
            snappedAngle: this.rotationSnappedAngle ?? undefined,
          },
        },
      });
    } else {
      const finalPosition = this.currentPosition || this.config.element;
      this.onUpdate({
        state: 'end',
        transformData: {
          type: wasState === 'dragging' ? 'move' : 'resize',
          changes: { rect: finalPosition },
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
          changes: { vertices: this.startVertices },
          metadata: { vertexIndex: this.activeVertexIndex || undefined },
        },
      });
    } else if (this.state === 'rotating') {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'rotate',
          changes: { rotation: this.initialRotation },
          metadata: {
            rotationAngle: this.initialRotation,
            rotationDelta: 0,
            rotationCenter: this.rotationCenter || undefined,
            isSnapped: false,
          },
        },
      });
    } else if (this.startElement) {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: this.state === 'dragging' ? 'move' : 'resize',
          changes: { rect: this.startElement },
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

  // ---------------------------------------------------------------------------
  // Private: state management
  // ---------------------------------------------------------------------------

  private reset() {
    this.state = 'idle';
    this.startPoint = null;
    this.startElement = null;
    this.startRotationElement = null;
    this.gestureRotationCenter = null;
    this.activeHandle = null;
    this.currentPosition = null;
    this.activeVertexIndex = null;
    this.startVertices = [];
    // Reset rotation state
    this.rotationCenter = null;
    this.centerScreen = null;
    this.initialRotation = 0;
    this.lastComputedRotation = 0;
    this.rotationDelta = 0;
    this.rotationSnappedAngle = null;
  }

  // ---------------------------------------------------------------------------
  // Private: coordinate transformation (screen → page → local)
  // ---------------------------------------------------------------------------

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

  /**
   * Calculate delta projected into the annotation's local (unrotated) coordinate space.
   * Used for resize and vertex-edit where mouse movement must be mapped to the
   * annotation's own axes, accounting for its rotation.
   */
  private calculateLocalDelta(clientX: number, clientY: number): Position {
    const pageDelta = this.calculateDelta(clientX, clientY);
    const { annotationRotation = 0 } = this.config;
    if (annotationRotation === 0) return pageDelta;

    const rad = (annotationRotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: cos * pageDelta.x + sin * pageDelta.y,
      y: -sin * pageDelta.x + cos * pageDelta.y,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: vertex clamping
  // ---------------------------------------------------------------------------

  private clampPoint(p: Position): Position {
    const bbox = this.config.constraints?.boundingBox;
    if (!bbox) return p;

    const { annotationRotation = 0 } = this.config;
    if (annotationRotation === 0) {
      return {
        x: Math.max(0, Math.min(p.x, bbox.width)),
        y: Math.max(0, Math.min(p.y, bbox.height)),
      };
    }

    // When rotated, vertices live in unrotated space. Transform to visual
    // (page) space, clamp to page bounds, then inverse-rotate back.
    const center = this.gestureRotationCenter ??
      this.config.rotationCenter ?? {
        x: this.config.element.origin.x + this.config.element.size.width / 2,
        y: this.config.element.origin.y + this.config.element.size.height / 2,
      };
    const visual = rotatePointAround(p, center, annotationRotation);

    const clampedX = Math.max(0, Math.min(visual.x, bbox.width));
    const clampedY = Math.max(0, Math.min(visual.y, bbox.height));

    if (clampedX === visual.x && clampedY === visual.y) return p;

    return rotatePointAround({ x: clampedX, y: clampedY }, center, -annotationRotation);
  }

  private calculateVertexPosition(clientX: number, clientY: number): Position[] {
    if (this.activeVertexIndex === null) return this.startVertices;

    const delta = this.calculateLocalDelta(clientX, clientY);
    const newVertices = [...this.startVertices];
    const currentVertex = newVertices[this.activeVertexIndex];

    const moved = {
      x: currentVertex.x + delta.x,
      y: currentVertex.y + delta.y,
    };
    newVertices[this.activeVertexIndex] = this.clampPoint(moved);

    return newVertices;
  }

  // ---------------------------------------------------------------------------
  // Private: drag position
  // ---------------------------------------------------------------------------

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

    // When the annotation is rotated, the visible footprint is the AABB, not
    // the unrotatedRect. Clamp based on AABB dimensions so the annotation can
    // move freely within the page bounds.
    const { annotationRotation = 0, constraints } = this.config;
    const bbox = constraints?.boundingBox;
    if (annotationRotation !== 0 && bbox) {
      let aabbW: number;
      let aabbH: number;
      let offsetX: number;
      let offsetY: number;

      if (this.startRotationElement) {
        aabbW = this.startRotationElement.size.width;
        aabbH = this.startRotationElement.size.height;
        offsetX = this.startRotationElement.origin.x - this.startElement.origin.x;
        offsetY = this.startRotationElement.origin.y - this.startElement.origin.y;
      } else {
        const rad = Math.abs((annotationRotation * Math.PI) / 180);
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const w = position.size.width;
        const h = position.size.height;
        aabbW = w * cos + h * sin;
        aabbH = w * sin + h * cos;
        offsetX = (w - aabbW) / 2;
        offsetY = (h - aabbH) / 2;
      }

      let { x, y } = position.origin;
      x = Math.max(-offsetX, Math.min(x, bbox.width - aabbW - offsetX));
      y = Math.max(-offsetY, Math.min(y, bbox.height - aabbH - offsetY));

      return { origin: { x, y }, size: position.size };
    }

    return applyConstraints(position, constraints, this.config.maintainAspectRatio ?? false);
  }

  // ---------------------------------------------------------------------------
  // Private: rotation
  // ---------------------------------------------------------------------------

  /**
   * Calculate the angle from the center to a point in screen coordinates.
   */
  private calculateAngleFromMouse(clientX: number, clientY: number): number {
    if (!this.centerScreen) return this.initialRotation;

    const dx = clientX - this.centerScreen.x;
    const dy = clientY - this.centerScreen.y;

    // Dead zone: when the mouse is very close to the center, atan2 becomes
    // extremely sensitive to sub-pixel movements. Hold the last stable angle.
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) return this.lastComputedRotation;

    // atan2 gives angle from +X axis; rotate +90° so 0° = top (north).
    // Subtract the page rotation offset to convert the screen-space angle
    // back to the page-space angle used by the annotation model.
    const pageRotOffset = (this.config.pageRotation ?? 0) * 90;
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90 - pageRotOffset;

    return normalizeAngle(Math.round(angleDeg));
  }

  private applyRotationSnapping(angle: number): {
    angle: number;
    isSnapped: boolean;
    snapTarget?: number;
  } {
    const snapAngles = this.config.rotationSnapAngles ?? [0, 90, 180, 270];
    const threshold = this.config.rotationSnapThreshold ?? 4;
    const normalizedAngle = normalizeAngle(angle);

    for (const candidate of snapAngles) {
      const normalizedCandidate = normalizeAngle(candidate);
      const diff = Math.abs(normalizedAngle - normalizedCandidate);
      const minimalDiff = Math.min(diff, 360 - diff);
      if (minimalDiff <= threshold) {
        return {
          angle: normalizedCandidate,
          isSnapped: true,
          snapTarget: normalizedCandidate,
        };
      }
    }

    return { angle: normalizedAngle, isSnapped: false };
  }
}
