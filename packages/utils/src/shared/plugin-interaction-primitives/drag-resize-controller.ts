import { Position, Rect } from '@embedpdf/models';
import { ROTATION_HANDLE_MARGIN } from './utils';

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

/** Get the anchor point (the visually fixed point) in page space for a given rect and anchor. */
function getAnchorPoint(rect: Rect, anchor: Anchor): Position {
  const x =
    anchor.x === 'left'
      ? rect.origin.x
      : anchor.x === 'right'
        ? rect.origin.x + rect.size.width
        : rect.origin.x + rect.size.width / 2;
  const y =
    anchor.y === 'top'
      ? rect.origin.y
      : anchor.y === 'bottom'
        ? rect.origin.y + rect.size.height
        : rect.origin.y + rect.size.height / 2;
  return { x, y };
}

/** Rotate a point around a center by the given angle in radians. */
function rotatePointAround(p: Position, c: Position, rad: number): Position {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: c.x + dx * cos - dy * sin,
    y: c.y + dx * sin + dy * cos,
  };
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
  private startAngle: number = 0;
  private initialRotation: number = 0; // The rotation value when interaction started
  private lastComputedRotation: number = 0; // The last computed rotation during move
  private cursorStartAngle: number = 0;
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
    this.gestureRotationCenter = this.config.rotationCenter ?? {
      x: this.config.element.origin.x + this.config.element.size.width / 2,
      y: this.config.element.origin.y + this.config.element.size.height / 2,
    };

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
    // (clientX/Y is the handle's getBoundingClientRect center, not the raw click).
    // The handle orbits at initialRotation degrees at distance `radius` from center.
    const { scale = 1 } = this.config;
    const orbitRect = this.config.rotationElement ?? this.config.element;
    const sw = orbitRect.size.width * scale;
    const sh = orbitRect.size.height * scale;
    const radius = orbitRadiusPx ?? Math.max(sw, sh) / 2 + ROTATION_HANDLE_MARGIN;
    // The handle's screen-space angle differs from the page-space angle by the
    // page rotation offset (each pageRotation unit is a 90° CW turn).
    const pageRotOffset = (this.config.pageRotation ?? 0) * 90;
    const screenAngleRad = ((initialRotation + pageRotOffset) * Math.PI) / 180;
    this.centerScreen = {
      x: clientX - radius * Math.sin(screenAngleRad),
      y: clientY + radius * Math.cos(screenAngleRad),
    };

    // Store the starting angle based on the initial rotation (where the handle is)
    // The handle starts at initialRotation degrees from vertical (0 = top)
    this.startAngle = initialRotation;
    this.initialRotation = initialRotation;
    this.lastComputedRotation = initialRotation;
    this.cursorStartAngle = initialRotation;
    this.rotationDelta = 0;
    this.rotationSnappedAngle = null;

    this.onUpdate({
      state: 'start',
      transformData: {
        type: 'rotate',
        changes: {
          rotation: initialRotation,
        },
        metadata: {
          rotationAngle: initialRotation,
          rotationDelta: 0,
          rotationCenter: this.rotationCenter,
          isSnapped: false,
        },
      },
    });
  }

  /**
   * Calculate the angle from the center to a point in screen coordinates.
   * Uses the cached `centerScreen` position computed once at drag start from
   * the handle element's actual DOM center (not the raw click position).
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

    return this.normalizeAngle(Math.round(angleDeg));
  }

  private normalizeAngle(angle: number): number {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  private applyRotationSnapping(angle: number): {
    angle: number;
    isSnapped: boolean;
    snapTarget?: number;
  } {
    const snapAngles = this.config.rotationSnapAngles ?? [0, 90, 180, 270];
    const threshold = this.config.rotationSnapThreshold ?? 4;
    const normalizedAngle = this.normalizeAngle(angle);

    for (const candidate of snapAngles) {
      const normalizedCandidate = this.normalizeAngle(candidate);
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

    return {
      angle: normalizedAngle,
      isSnapped: false,
    };
  }

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
        transformData: {
          type: 'move',
          changes: {
            rect: position,
          },
        },
      });
    } else if (this.state === 'resizing' && this.activeHandle && this.startElement) {
      const delta = this.calculateLocalDelta(clientX, clientY);
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
    } else if (this.state === 'rotating' && this.rotationCenter) {
      // Calculate the new rotation angle based on where the mouse is
      const absoluteAngle = this.calculateAngleFromMouse(clientX, clientY);
      const snapResult = this.applyRotationSnapping(absoluteAngle);
      const snappedAngle = this.normalizeAngle(snapResult.angle);
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
          changes: {
            rotation: snappedAngle,
          },
          metadata: {
            rotationAngle: snappedAngle,
            rotationDelta: this.rotationDelta,
            rotationCenter: this.rotationCenter,
            isSnapped: snapResult.isSnapped,
            snappedAngle: this.rotationSnappedAngle ?? undefined,
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
    } else if (wasState === 'rotating') {
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'rotate',
          changes: {
            rotation: this.lastComputedRotation,
          },
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
    } else if (this.state === 'rotating') {
      // Cancel rotation - restore original rotation
      this.onUpdate({
        state: 'end',
        transformData: {
          type: 'rotate',
          changes: {
            rotation: this.initialRotation, // Original rotation before interaction
          },
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
    this.startRotationElement = null;
    this.gestureRotationCenter = null;
    this.activeHandle = null;
    this.currentPosition = null;
    this.activeVertexIndex = null;
    this.startVertices = [];
    // Reset rotation state
    this.rotationCenter = null;
    this.centerScreen = null;
    this.startAngle = 0;
    this.initialRotation = 0;
    this.lastComputedRotation = 0;
    this.cursorStartAngle = 0;
    this.rotationDelta = 0;
    this.rotationSnappedAngle = null;
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
    const rad = (annotationRotation * Math.PI) / 180;

    // Rotate to visual space
    const visual = rotatePointAround(p, center, rad);

    // Clamp in visual space
    const clampedX = Math.max(0, Math.min(visual.x, bbox.width));
    const clampedY = Math.max(0, Math.min(visual.y, bbox.height));

    // If no clamping was needed, return the original point
    if (clampedX === visual.x && clampedY === visual.y) return p;

    // Inverse-rotate the clamped visual position back to unrotated space
    return rotatePointAround({ x: clampedX, y: clampedY }, center, -rad);
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
        // Use the captured AABB rect (handles custom pivots correctly)
        aabbW = this.startRotationElement.size.width;
        aabbH = this.startRotationElement.size.height;
        offsetX = this.startRotationElement.origin.x - this.startElement.origin.x;
        offsetY = this.startRotationElement.origin.y - this.startElement.origin.y;
      } else {
        // Compute AABB dimensions from unrotated rect + rotation (center rotation)
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

      // Clamp so the AABB stays within page bounds
      let { x, y } = position.origin;
      x = Math.max(-offsetX, Math.min(x, bbox.width - aabbW - offsetX));
      y = Math.max(-offsetY, Math.min(y, bbox.height - aabbH - offsetY));

      return {
        origin: { x, y },
        size: position.size,
      };
    }

    return this.applyConstraints(position);
  }

  /**
   * Calculate the new rect after a resize operation.
   * Pipeline: applyDelta → enforceAspectRatio → clampToBounds → applyConstraints
   */
  private calculateResizePosition(delta: Position, handle: ResizeHandle): Rect {
    if (!this.startElement) return this.config.element;

    const { annotationRotation = 0 } = this.config;
    const bbox = this.config.constraints?.boundingBox;

    // For rotated annotations, clamp using visual AABB bounds.
    // This avoids "other side growth" when the dragged side hits the page edge.
    if (annotationRotation !== 0 && bbox) {
      const target = this.computeResizeRect(delta, handle, false, true);
      if (this.isRectWithinRotatedBounds(target, annotationRotation, bbox)) {
        return target;
      }

      let best = this.computeResizeRect({ x: 0, y: 0 }, handle, false, true);
      let low = 0;
      let high = 1;
      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        const trial = this.computeResizeRect(
          { x: delta.x * mid, y: delta.y * mid },
          handle,
          false,
          true,
        );
        if (this.isRectWithinRotatedBounds(trial, annotationRotation, bbox)) {
          best = trial;
          low = mid;
        } else {
          high = mid;
        }
      }

      return best;
    }

    return this.computeResizeRect(delta, handle, true, false);
  }

  private computeResizeRect(
    delta: Position,
    handle: ResizeHandle,
    clampLocalBounds: boolean,
    skipConstraintBoundingClamp: boolean,
  ): Rect {
    if (!this.startElement) return this.config.element;

    const anchor = getAnchor(handle);
    const aspectRatio = this.startElement.size.width / this.startElement.size.height || 1;

    // Step 1: Apply delta to get raw resize
    let rect = this.applyResizeDelta(delta, anchor);

    // Step 2: Enforce aspect ratio if enabled
    if (this.config.maintainAspectRatio) {
      rect = this.enforceAspectRatio(rect, anchor, aspectRatio);
    }

    // Step 3: Clamp in local/unrotated frame when requested
    if (clampLocalBounds) {
      rect = this.clampToBounds(rect, anchor);
    }

    // Step 4: Apply min/max constraints
    rect = this.applyConstraints(rect, skipConstraintBoundingClamp);

    // In rotated resize mode we skip axis-aligned bounding clamps and solve
    // against visual bounds separately. Re-anchor after size constraints so
    // dragging past min/max does not keep translating the rect.
    if (skipConstraintBoundingClamp) {
      rect = this.reanchorRect(rect, anchor);
    }

    // Step 5: Compensate for visual anchor drift when the annotation is rotated.
    // Resizing shifts the unrotatedRect center, which moves the rotation center and
    // causes the visually-anchored edge to drift. Translate the rect to cancel this.
    const { annotationRotation = 0 } = this.config;
    if (annotationRotation !== 0) {
      const rad = (annotationRotation * Math.PI) / 180;
      const anchorPt = getAnchorPoint(this.startElement, anchor);
      const oldCenter: Position = {
        x: this.startElement.origin.x + this.startElement.size.width / 2,
        y: this.startElement.origin.y + this.startElement.size.height / 2,
      };
      const newCenter: Position = {
        x: rect.origin.x + rect.size.width / 2,
        y: rect.origin.y + rect.size.height / 2,
      };
      const oldVisual = rotatePointAround(anchorPt, oldCenter, rad);
      const newVisual = rotatePointAround(anchorPt, newCenter, rad);
      rect = {
        origin: {
          x: rect.origin.x + (oldVisual.x - newVisual.x),
          y: rect.origin.y + (oldVisual.y - newVisual.y),
        },
        size: rect.size,
      };
    }

    return rect;
  }

  private isRectWithinRotatedBounds(
    rect: Rect,
    angleDegrees: number,
    bbox: { width: number; height: number },
  ): boolean {
    const eps = 1e-6;
    const rad = (angleDegrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = rect.size.width;
    const h = rect.size.height;
    const aabbW = w * cos + h * sin;
    const aabbH = w * sin + h * cos;
    const centerX = rect.origin.x + w / 2;
    const centerY = rect.origin.y + h / 2;
    const left = centerX - aabbW / 2;
    const top = centerY - aabbH / 2;
    const right = centerX + aabbW / 2;
    const bottom = centerY + aabbH / 2;

    return left >= -eps && top >= -eps && right <= bbox.width + eps && bottom <= bbox.height + eps;
  }

  /**
   * Reposition rect from current size so the start-gesture anchor remains fixed.
   * This prevents translation drift when constraints clamp width/height.
   */
  private reanchorRect(rect: Rect, anchor: Anchor): Rect {
    const start = this.startElement!;
    let x: number;
    let y: number;

    if (anchor.x === 'left') {
      x = start.origin.x;
    } else if (anchor.x === 'right') {
      x = start.origin.x + start.size.width - rect.size.width;
    } else {
      x = start.origin.x + (start.size.width - rect.size.width) / 2;
    }

    if (anchor.y === 'top') {
      y = start.origin.y;
    } else if (anchor.y === 'bottom') {
      y = start.origin.y + start.size.height - rect.size.height;
    } else {
      y = start.origin.y + (start.size.height - rect.size.height) / 2;
    }

    return {
      origin: { x, y },
      size: rect.size,
    };
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
   * Clamp rect to bounding box while respecting anchor.
   */
  private clampToBounds(rect: Rect, anchor: Anchor): Rect {
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

  private applyConstraints(position: Rect, skipBoundingClamp: boolean = false): Rect {
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
    if (constraints.boundingBox && !skipBoundingClamp) {
      x = Math.max(0, Math.min(x, constraints.boundingBox.width - width));
      y = Math.max(0, Math.min(y, constraints.boundingBox.height - height));
    }

    return { origin: { x, y }, size: { width, height } };
  }
}
