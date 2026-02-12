<template>
  <div data-no-interaction :style="contentsStyle">
    <!-- Outer div: AABB container - stable center for guide lines and rotation handle -->
    <div :style="outerAABBStyle">
      <!-- Rotation guide lines - anchored at stable AABB center -->
      <template v-if="rotationActive">
        <div :style="guideHorizontalStyle" />
        <div :style="guideVerticalStyle" />
        <div :style="guideAngleStyle" />
      </template>

      <!-- Rotation handle - orbits in AABB space -->
      <template v-if="isSelected && effectiveIsRotatable && rotationHandleData">
        <div
          @pointerenter="isHandleHovered = true"
          @pointerleave="
            isHandleHovered = false;
            cursorScreen = null;
          "
          @pointermove="onHandlePointerMove"
          :style="contentsStyle"
        >
          <!-- Connector line -->
          <div v-if="SHOW_CONNECTOR" :style="connectorLineStyle" />
          <!-- Rotation handle element -->
          <slot
            v-if="slots['rotation-handle']"
            name="rotation-handle"
            v-bind="rotationHandleSlotProps"
          >
            <div v-bind="rotationHandleBindings" :style="rotationHandleStyle">
              <svg
                :width="rotationIconSize"
                :height="rotationIconSize"
                viewBox="0 0 24 24"
                fill="none"
                :stroke="ROTATION_ICON_COLOR"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </div>
          </slot>
          <div v-else v-bind="rotationHandleBindings" :style="rotationHandleStyle">
            <svg
              :width="rotationIconSize"
              :height="rotationIconSize"
              viewBox="0 0 24 24"
              fill="none"
              :stroke="ROTATION_ICON_COLOR"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </div>
        </div>
      </template>

      <!-- Inner div: rotated content area - holds content, resize handles, vertex handles -->
      <div
        v-bind="{ ...(effectiveIsDraggable && isSelected ? dragProps : {}), ...doubleProps }"
        :style="innerRotatedStyle"
      >
        <!-- Annotation content - renders in unrotated coordinate space -->
        <slot :annotation="childObject"></slot>

        <!-- Resize handles - rotate with the shape -->
        <template v-if="isSelected && effectiveIsResizable && !rotationActive">
          <template v-for="{ key, style, ...handle } in resize" :key="key">
            <slot
              v-if="slots['resize-handle']"
              name="resize-handle"
              v-bind="{ key, style, ...handle, backgroundColor: HANDLE_COLOR }"
            >
              <div v-bind="handle" :style="[style, { backgroundColor: HANDLE_COLOR }]" />
            </slot>
            <div v-else v-bind="handle" :style="[style, { backgroundColor: HANDLE_COLOR }]" />
          </template>
        </template>

        <!-- Vertex handles - rotate with the shape -->
        <template
          v-if="
            isSelected &&
            permissions.canModifyAnnotations &&
            !isMultiSelected &&
            !rotationActive &&
            vertices.length > 0
          "
        >
          <template v-for="{ key, style, ...vertex } in vertices" :key="key">
            <slot
              v-if="slots['vertex-handle']"
              name="vertex-handle"
              v-bind="{ key, style, ...vertex, backgroundColor: VERTEX_COLOR }"
            >
              <div v-bind="vertex" :style="[style, { backgroundColor: VERTEX_COLOR }]" />
            </slot>
            <div v-else v-bind="vertex" :style="[style, { backgroundColor: VERTEX_COLOR }]" />
          </template>
        </template>
      </div>
    </div>

    <!-- Selection Menu: Supports BOTH render function and slot - hide when multi-selected or rotating -->
    <CounterRotate v-if="shouldShowMenu && !rotationActive" :rect="menuRect" :rotation="rotation">
      <template #default="{ rect, menuWrapperProps }">
        <!-- Priority 1: Render function prop (schema-driven) -->
        <component v-if="selectionMenu" :is="renderSelectionMenu(rect, menuWrapperProps)" />

        <!-- Priority 2: Slot (manual customization) -->
        <slot
          v-else
          name="selection-menu"
          :context="menuContext"
          :selected="isSelected"
          :rect="rect"
          :placement="menuPlacement"
          :menuWrapperProps="menuWrapperProps"
        />
      </template>
    </CounterRotate>

    <!-- Cursor-following rotation tooltip - portaled to body to escape CSS transform chain -->
    <Teleport to="body" v-if="(rotationActive || isHandleHovered) && cursorScreen">
      <div :style="tooltipStyle">{{ normalizedRotationDisplay.toFixed(0) }}°</div>
    </Teleport>
  </div>
</template>

<script lang="ts">
// Disable attribute inheritance so style doesn't fall through to root element
export default {
  inheritAttrs: false,
};
</script>

<script setup lang="ts" generic="T extends PdfAnnotationObject">
import {
  ref,
  computed,
  watchEffect,
  useSlots,
  toRaw,
  shallowRef,
  Teleport,
  type CSSProperties,
  type VNode,
} from 'vue';
import { PdfAnnotationObject, Rect } from '@embedpdf/models';
import { inferRotationCenterFromRects } from '@embedpdf/plugin-annotation';
import {
  CounterRotate,
  MenuWrapperProps,
  SelectionMenuPlacement,
  useDoublePressProps,
  useInteractionHandles,
} from '@embedpdf/utils/vue';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useDocumentPermissions } from '@embedpdf/core/vue';
import { VertexConfig } from '../../shared/types';
import { useAnnotationCapability, useAnnotationPlugin } from '../hooks';
import {
  AnnotationSelectionContext,
  AnnotationSelectionMenuRenderFn,
  RotationHandleUI,
  SelectionOutline,
} from '../types';

const props = withDefaults(
  defineProps<{
    scale: number;
    documentId: string;
    pageIndex: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    trackedAnnotation: TrackedAnnotation<T>;
    isSelected: boolean;
    /** Whether multiple annotations are selected (container becomes passive) */
    isMultiSelected?: boolean;
    isDraggable: boolean;
    isResizable: boolean;
    isRotatable?: boolean;
    lockAspectRatio?: boolean;
    vertexConfig?: VertexConfig<T>;
    selectionMenu?: AnnotationSelectionMenuRenderFn;
    /** @deprecated Use `selectionOutline.offset` instead */
    outlineOffset?: number;
    onDoubleClick?: (event: PointerEvent | MouseEvent) => void;
    onSelect: (event: TouchEvent | MouseEvent) => void;
    zIndex?: number;
    /** @deprecated Use `selectionOutline.color` instead */
    selectionOutlineColor?: string;
    /** Customize the selection outline (color, style, width, offset) */
    selectionOutline?: SelectionOutline;
    /** Customize rotation handle appearance */
    rotationUI?: RotationHandleUI;
    style?: CSSProperties;
  }>(),
  {
    lockAspectRatio: false,
    isMultiSelected: false,
    isRotatable: true,
    outlineOffset: 1,
    zIndex: 1,
    selectionOutlineColor: '#007ACC',
  },
);

// UI constants
const HANDLE_COLOR = '#007ACC';
const VERTEX_COLOR = '#007ACC';
const HANDLE_SIZE = 12;
const VERTEX_SIZE = 12;
const ROTATION_SIZE = computed(() => props.rotationUI?.size ?? 32);
const ROTATION_COLOR = computed(() => props.rotationUI?.color ?? '#007ACC');
const ROTATION_CONNECTOR_COLOR = computed(
  () => props.rotationUI?.connectorColor ?? ROTATION_COLOR.value,
);
const ROTATION_ICON_COLOR = computed(() => props.rotationUI?.iconColor ?? 'white');
const SHOW_CONNECTOR = computed(() => props.rotationUI?.showConnector ?? false);
const ROTATION_MARGIN = computed(() => props.rotationUI?.margin);

// Outline resolution (new object > deprecated props > defaults)
const outlineColor = computed(
  () => props.selectionOutline?.color ?? props.selectionOutlineColor ?? '#007ACC',
);
const outlineStyle = computed(() => props.selectionOutline?.style ?? 'solid');
const outlineWidth = computed(() => props.selectionOutline?.width ?? 1);
const outlineOff = computed(() => props.selectionOutline?.offset ?? props.outlineOffset ?? 1);

const preview = shallowRef<Partial<T>>(toRaw(props.trackedAnnotation.object));
const liveRotation = ref<number | null>(null);
const cursorScreen = ref<{ x: number; y: number } | null>(null);
const isHandleHovered = ref(false);
const { provides: annotationCapability } = useAnnotationCapability();
const { plugin: annotationPlugin } = useAnnotationPlugin();
const permissions = useDocumentPermissions(props.documentId);
const gestureBaseRef = ref<T | null>(null);
const gestureBaseRectRef = shallowRef<Rect | null>(null);

// When multi-selected, disable individual drag/resize/rotate - GroupSelectionBox handles it
const effectiveIsDraggable = computed(
  () => permissions.value.canModifyAnnotations && props.isDraggable && !props.isMultiSelected,
);
const effectiveIsResizable = computed(
  () => permissions.value.canModifyAnnotations && props.isResizable && !props.isMultiSelected,
);
const effectiveIsRotatable = computed(
  () => permissions.value.canModifyAnnotations && props.isRotatable && !props.isMultiSelected,
);

// Wrap onDoubleClick to respect permissions - check at call time
const guardedOnDoubleClick = props.onDoubleClick
  ? (e: PointerEvent | MouseEvent) => {
      if (permissions.value.canModifyAnnotations) {
        props.onDoubleClick?.(e);
      }
    }
  : undefined;

// Get scoped API for this document
const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

const currentObject = computed<T>(
  () => ({ ...toRaw(props.trackedAnnotation.object), ...toRaw(preview.value) }) as T,
);

// Get annotation's current rotation
// During drag, use liveRotation if available; otherwise use the annotation's rotation
const annotationRotation = computed(
  () => liveRotation.value ?? (currentObject.value as any).rotation ?? 0,
);
const rotationDisplay = computed(
  () => liveRotation.value ?? (currentObject.value as any).rotation ?? 0,
);
const normalizedRotationDisplay = computed(() => {
  const val = rotationDisplay.value;
  return Number.isFinite(val) ? Math.round(val * 10) / 10 : 0;
});
const rotationActive = computed(() => liveRotation.value !== null);

// Geometry model:
// - `rect` is the visible AABB container.
// - `unrotatedRect` is the local editing frame for resize/vertex operations.
const explicitUnrotatedRect = computed(
  () => (currentObject.value as any).unrotatedRect as Rect | undefined,
);
const effectiveUnrotatedRect = computed(
  () => explicitUnrotatedRect.value ?? currentObject.value.rect,
);
const rotationPivot = computed(() => {
  if (explicitUnrotatedRect.value && annotationRotation.value !== 0) {
    return inferRotationCenterFromRects(
      effectiveUnrotatedRect.value,
      currentObject.value.rect,
      annotationRotation.value,
    );
  }
  return undefined;
});
const controllerElement = computed(() => effectiveUnrotatedRect.value);

// For children, override rect to use unrotatedRect so content renders in unrotated space
const childObject = computed<T>(() => {
  if (explicitUnrotatedRect.value) {
    return { ...currentObject.value, rect: explicitUnrotatedRect.value };
  }
  return currentObject.value;
});

// Determine if we should show the outline
// When multi-selected, don't show individual outlines - GroupSelectionBox shows the group outline
const showOutline = computed(() => props.isSelected && !props.isMultiSelected);

// --- Selection Menu Logic ---

// Check if we should show any menu at all - hide when multi-selected
const shouldShowMenu = computed(() => {
  return (
    props.isSelected && !props.isMultiSelected && (props.selectionMenu || slots['selection-menu'])
  );
});

// Computed rect for menu positioning
const menuRect = computed<Rect>(() => ({
  origin: {
    x: currentObject.value.rect.origin.x * props.scale,
    y: currentObject.value.rect.origin.y * props.scale,
  },
  size: {
    width: currentObject.value.rect.size.width * props.scale,
    height: currentObject.value.rect.size.height * props.scale,
  },
}));

// Build the context object for selection menu
const menuContext = computed<AnnotationSelectionContext>(() => ({
  type: 'annotation',
  annotation: props.trackedAnnotation,
  pageIndex: props.pageIndex,
}));

// Placement hints - calculate suggestTop based on rotation handle position
const menuPlacement = computed<SelectionMenuPlacement>(() => {
  const effectiveAngle = (((annotationRotation.value + props.rotation * 90) % 360) + 360) % 360;
  const handleNearMenuSide =
    effectiveIsRotatable.value && effectiveAngle > 90 && effectiveAngle < 270;
  return {
    suggestTop: handleNearMenuSide,
  };
});

// Render via function (for schema-driven approach)
const renderSelectionMenu = (rect: Rect, menuWrapperProps: MenuWrapperProps): VNode | null => {
  if (!props.selectionMenu) return null;

  return props.selectionMenu({
    rect,
    menuWrapperProps,
    selected: props.isSelected,
    placement: menuPlacement.value,
    context: menuContext.value,
  });
};

const verticesSnapshot = computed(() => {
  const obj = toRaw(currentObject.value);
  return props.vertexConfig?.extractVertices(obj) ?? [];
});

const constraintsSnapshot = computed(() => ({
  minWidth: 10,
  minHeight: 10,
  boundingBox: {
    width: props.pageWidth,
    height: props.pageHeight,
  },
}));

const {
  dragProps,
  vertices,
  resize,
  rotation: rotationHandleData,
} = useInteractionHandles({
  controller: {
    element: controllerElement,
    vertices: verticesSnapshot,
    constraints: constraintsSnapshot,
    maintainAspectRatio: computed(() => props.lockAspectRatio),
    pageRotation: computed(() => props.rotation),
    annotationRotation: computed(() => annotationRotation.value),
    rotationCenter: computed(() => rotationPivot.value),
    rotationElement: computed(() => currentObject.value.rect),
    scale: computed(() => props.scale),
    // Disable interaction handles when multi-selected
    enabled: computed(() => props.isSelected && !props.isMultiSelected),
    onUpdate: (event) => {
      if (!event.transformData?.type || props.isMultiSelected) return;

      const plugin = annotationPlugin.value;
      if (!plugin) return;

      const { type, changes, metadata } = event.transformData;
      const id = props.trackedAnnotation.object.id;
      const pageSize = { width: props.pageWidth, height: props.pageHeight };

      // Gesture start - initialize plugin drag/resize
      if (event.state === 'start') {
        // Use unrotatedRect as gesture base so deltas are computed in unrotated space
        gestureBaseRectRef.value =
          (props.trackedAnnotation.object as any).unrotatedRect ??
          props.trackedAnnotation.object.rect;
        gestureBaseRef.value = currentObject.value; // For vertex edit

        if (type === 'move') {
          plugin.startDrag(props.documentId, { annotationIds: [id], pageSize });
        } else if (type === 'resize') {
          plugin.startResize(props.documentId, {
            annotationIds: [id],
            pageSize,
            resizeHandle: metadata?.handle ?? 'se',
          });
        }
      }

      // Gesture update - call plugin, preview comes from subscription
      if (changes.rect && gestureBaseRectRef.value) {
        if (type === 'move') {
          const delta = {
            x: changes.rect.origin.x - gestureBaseRectRef.value.origin.x,
            y: changes.rect.origin.y - gestureBaseRectRef.value.origin.y,
          };
          plugin.updateDrag(props.documentId, delta);
        } else if (type === 'resize') {
          plugin.updateResize(props.documentId, changes.rect);
        }
      }

      // Vertex edit - handle directly (no attached link handling needed)
      if (type === 'vertex-edit' && changes.vertices && props.vertexConfig) {
        const base = gestureBaseRef.value ?? currentObject.value;
        const vertexChanges = props.vertexConfig.transformAnnotation(toRaw(base), changes.vertices);
        const patched = annotationCapability.value?.transformAnnotation<T>(base, {
          type,
          changes: vertexChanges as Partial<T>,
          metadata,
        });
        if (patched) {
          preview.value = { ...toRaw(preview.value), ...patched };
          if (event.state === 'end') {
            annotationProvides.value?.updateAnnotation(props.pageIndex, id, patched);
          }
        }
      }

      // Rotation - handle via plugin rotation API
      if (type === 'rotate') {
        const cursorAngle = metadata?.rotationAngle ?? annotationRotation.value;
        const cursorPos = metadata?.cursorPosition;
        if (cursorPos) cursorScreen.value = { x: cursorPos.clientX, y: cursorPos.clientY };
        if (event.state === 'start') {
          liveRotation.value = cursorAngle;
          plugin.startRotation(props.documentId, {
            annotationIds: [id],
            cursorAngle,
            rotationCenter: metadata?.rotationCenter,
          });
        } else if (event.state === 'move') {
          liveRotation.value = cursorAngle;
          plugin.updateRotation(props.documentId, cursorAngle, metadata?.rotationDelta);
        } else if (event.state === 'end') {
          liveRotation.value = null;
          cursorScreen.value = null;
          plugin.commitRotation(props.documentId);
        }
        return;
      }

      // Gesture end - commit
      if (event.state === 'end') {
        gestureBaseRectRef.value = null;
        gestureBaseRef.value = null;
        if (type === 'move') plugin.commitDrag(props.documentId);
        else if (type === 'resize') plugin.commitResize(props.documentId);
      }
    },
  },
  resizeUI: {
    handleSize: HANDLE_SIZE,
    spacing: outlineOff.value,
    offsetMode: 'outside',
    includeSides: props.lockAspectRatio ? false : true,
    zIndex: props.zIndex + 1,
  },
  vertexUI: {
    vertexSize: VERTEX_SIZE,
    zIndex: props.zIndex + 2,
  },
  rotationUI: {
    handleSize: ROTATION_SIZE.value,
    margin: ROTATION_MARGIN.value,
    zIndex: props.zIndex + 3,
    showConnector: SHOW_CONNECTOR.value,
  },
  includeVertices: !!props.vertexConfig,
  includeRotation: effectiveIsRotatable,
  currentRotation: annotationRotation,
});

const doubleProps = useDoublePressProps(guardedOnDoubleClick);

// Handle pointer move on the rotation handle wrapper (for cursor tooltip when not rotating)
const onHandlePointerMove = (e: PointerEvent) => {
  if (!rotationActive.value) {
    cursorScreen.value = { x: e.clientX, y: e.clientY };
  }
};

// Sync preview with tracked annotation when it changes
watchEffect(() => {
  if (props.trackedAnnotation.object) {
    preview.value = props.trackedAnnotation.object;
  }
});

// Subscribe to unified drag/resize/rotate changes - plugin sends pre-computed patches!
// ALL preview updates come through here (primary, attached links, multi-select)
watchEffect((onCleanup) => {
  const plugin = annotationPlugin.value;
  if (!plugin) return;

  const id = props.trackedAnnotation.object.id;

  const handleEvent = (event: {
    documentId: string;
    type: string;
    previewPatches?: Record<string, any>;
  }) => {
    if (event.documentId !== props.documentId) return;
    if (event.type === 'end' || event.type === 'cancel') {
      liveRotation.value = null;
    }
    const patch = event.previewPatches?.[id];
    if (event.type === 'update' && patch) {
      preview.value = { ...toRaw(preview.value), ...patch } as T;
    } else if (event.type === 'cancel') {
      preview.value = props.trackedAnnotation.object;
    }
  };

  const unsubs = [
    plugin.onDragChange(handleEvent),
    plugin.onResizeChange(handleEvent),
    plugin.onRotateChange(handleEvent),
  ];

  onCleanup(() => unsubs.forEach((u) => u()));
});

// ─── Layout computations ───────────────────────────────────────────────
const aabbWidth = computed(() => currentObject.value.rect.size.width * props.scale);
const aabbHeight = computed(() => currentObject.value.rect.size.height * props.scale);
const innerWidth = computed(() => effectiveUnrotatedRect.value.size.width * props.scale);
const innerHeight = computed(() => effectiveUnrotatedRect.value.size.height * props.scale);
const usesCustomPivot = computed(
  () => Boolean(explicitUnrotatedRect.value) && annotationRotation.value !== 0,
);
const innerLeft = computed(() =>
  usesCustomPivot.value
    ? (effectiveUnrotatedRect.value.origin.x - currentObject.value.rect.origin.x) * props.scale
    : (aabbWidth.value - innerWidth.value) / 2,
);
const innerTop = computed(() =>
  usesCustomPivot.value
    ? (effectiveUnrotatedRect.value.origin.y - currentObject.value.rect.origin.y) * props.scale
    : (aabbHeight.value - innerHeight.value) / 2,
);
const innerTransformOrigin = computed(() => {
  if (usesCustomPivot.value && rotationPivot.value) {
    return `${(rotationPivot.value.x - effectiveUnrotatedRect.value.origin.x) * props.scale}px ${(rotationPivot.value.y - effectiveUnrotatedRect.value.origin.y) * props.scale}px`;
  }
  return 'center center';
});
const centerX = computed(() =>
  rotationPivot.value
    ? (rotationPivot.value.x - currentObject.value.rect.origin.x) * props.scale
    : aabbWidth.value / 2,
);
const centerY = computed(() =>
  rotationPivot.value
    ? (rotationPivot.value.y - currentObject.value.rect.origin.y) * props.scale
    : aabbHeight.value / 2,
);
const guideLength = computed(() => Math.max(300, Math.max(aabbWidth.value, aabbHeight.value) + 80));
const rotationIconSize = computed(() => Math.round(ROTATION_SIZE.value * 0.6));

// ─── Extracted style computations ──────────────────────────────────────
const contentsStyle: CSSProperties = { display: 'contents' };

const outerAABBStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${currentObject.value.rect.origin.x * props.scale}px`,
  top: `${currentObject.value.rect.origin.y * props.scale}px`,
  width: `${aabbWidth.value}px`,
  height: `${aabbHeight.value}px`,
  pointerEvents: 'none',
  zIndex: props.zIndex,
  ...(props.style ?? {}),
}));

const innerRotatedStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${innerLeft.value}px`,
  top: `${innerTop.value}px`,
  width: `${innerWidth.value}px`,
  height: `${innerHeight.value}px`,
  transform: annotationRotation.value !== 0 ? `rotate(${annotationRotation.value}deg)` : undefined,
  transformOrigin: innerTransformOrigin.value,
  outline: showOutline.value
    ? `${outlineWidth.value}px ${outlineStyle.value} ${outlineColor.value}`
    : 'none',
  outlineOffset: showOutline.value ? `${outlineOff.value}px` : '0px',
  pointerEvents: props.isSelected && !props.isMultiSelected ? 'auto' : 'none',
  touchAction: 'none',
  cursor: props.isSelected && effectiveIsDraggable.value ? 'move' : 'default',
}));

const guideHorizontalStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${centerX.value - guideLength.value / 2}px`,
  top: `${centerY.value}px`,
  width: `${guideLength.value}px`,
  height: '1px',
  backgroundColor: ROTATION_CONNECTOR_COLOR.value,
  opacity: 0.35,
  pointerEvents: 'none',
}));

const guideVerticalStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${centerX.value}px`,
  top: `${centerY.value - guideLength.value / 2}px`,
  width: '1px',
  height: `${guideLength.value}px`,
  backgroundColor: ROTATION_CONNECTOR_COLOR.value,
  opacity: 0.35,
  pointerEvents: 'none',
}));

const guideAngleStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${centerX.value - guideLength.value / 2}px`,
  top: `${centerY.value}px`,
  width: `${guideLength.value}px`,
  height: '1px',
  transformOrigin: 'center center',
  transform: `rotate(${annotationRotation.value}deg)`,
  backgroundColor: ROTATION_CONNECTOR_COLOR.value,
  opacity: 0.8,
  pointerEvents: 'none',
}));

const connectorLineStyle = computed<CSSProperties>(() => ({
  ...(rotationHandleData.value?.connector.style ?? {}),
  backgroundColor: ROTATION_CONNECTOR_COLOR.value,
  opacity: rotationActive.value ? 0 : 1,
}));

const rotationHandleStyle = computed<CSSProperties>(() => ({
  ...(rotationHandleData.value?.handle.style ?? {}),
  backgroundColor: ROTATION_COLOR.value,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'auto',
  opacity: rotationActive.value ? 0 : 1,
}));

// Event handlers from the rotation handle (without style - style is applied separately)
const rotationHandleBindings = computed(() => {
  if (!rotationHandleData.value) return {};
  const { style: _s, ...rest } = rotationHandleData.value.handle;
  return rest;
});

const rotationHandleSlotProps = computed(() => {
  if (!rotationHandleData.value) return {};
  return {
    ...rotationHandleData.value.handle,
    backgroundColor: ROTATION_COLOR.value,
    iconColor: ROTATION_ICON_COLOR.value,
    connectorStyle: connectorLineStyle.value,
    showConnector: SHOW_CONNECTOR.value,
    opacity: rotationActive.value ? 0 : 1,
  };
});

const tooltipStyle = computed<CSSProperties>(() => ({
  position: 'fixed',
  left: cursorScreen.value ? `${cursorScreen.value.x + 16}px` : '0',
  top: cursorScreen.value ? `${cursorScreen.value.y - 16}px` : '0',
  background: 'rgba(0,0,0,0.8)',
  color: '#fff',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'monospace',
  pointerEvents: 'none',
  zIndex: 10000,
  whiteSpace: 'nowrap',
}));

// Add useSlots to access slot information
const slots = useSlots();
</script>
