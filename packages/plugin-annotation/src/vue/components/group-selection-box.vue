<template>
  <div v-if="selectedAnnotations.length >= 2" data-group-selection-box data-no-interaction>
    <!-- Outer div: AABB container - stable center for guide lines and rotation handle -->
    <div :style="outerStyle">
      <!-- Rotation guide lines - anchored at stable center -->
      <template v-if="rotationActive">
        <div :style="guideHorizontalStyle" />
        <div :style="guideVerticalStyle" />
        <div :style="guideAngleStyle" />
      </template>

      <!-- Rotation handle - orbits in AABB space -->
      <template v-if="effectiveIsRotatable && rotationHandleData">
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

      <!-- Inner div: group content area with outline and resize handles -->
      <div
        v-bind="
          effectiveIsDraggable
            ? dragProps
            : { onPointerdown: (e: PointerEvent) => e.stopPropagation() }
        "
        :style="boxStyle"
      >
        <!-- Resize handles -->
        <template v-if="effectiveIsResizable && !rotationActive">
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
      </div>
    </div>

    <!-- Group selection menu -->
    <CounterRotate v-if="shouldShowMenu" :rect="menuRect" :rotation="rotation">
      <template #default="{ rect, menuWrapperProps }">
        <!-- Priority 1: Render function prop (schema-driven) -->
        <component v-if="groupSelectionMenu" :is="renderGroupMenu(rect, menuWrapperProps)" />

        <!-- Priority 2: Slot (manual customization) -->
        <slot
          v-else
          name="group-selection-menu"
          :context="menuContext"
          :selected="true"
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

<script setup lang="ts">
import {
  ref,
  computed,
  useSlots,
  type CSSProperties,
  type VNode,
  shallowRef,
  watch,
  Teleport,
} from 'vue';
import { Rect, boundingRectOrEmpty } from '@embedpdf/models';
import {
  CounterRotate,
  MenuWrapperProps,
  SelectionMenuPlacement,
  useInteractionHandles,
} from '@embedpdf/utils/vue';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useDocumentPermissions } from '@embedpdf/core/vue';
import { useAnnotationPlugin } from '../hooks';
import {
  GroupSelectionContext,
  GroupSelectionMenuRenderFn,
  ResizeHandleUI,
  RotationHandleUI,
  RotationHandleSlotProps,
  SelectionOutline,
} from '../types';

const props = withDefaults(
  defineProps<{
    documentId: string;
    pageIndex: number;
    scale: number;
    rotation: number;
    pageWidth: number;
    pageHeight: number;
    /** All selected annotations on this page */
    selectedAnnotations: TrackedAnnotation[];
    /** Whether the group is draggable (all annotations must be group-draggable) */
    isDraggable: boolean;
    /** Whether the group is resizable (all annotations must be group-resizable) */
    isResizable: boolean;
    /** Whether the group can be rotated */
    isRotatable?: boolean;
    /** Whether to lock aspect ratio during group resize */
    lockAspectRatio?: boolean;
    /** Resize handle UI customization */
    resizeUi?: ResizeHandleUI;
    /** Rotation handle UI customization */
    rotationUi?: RotationHandleUI;
    /** @deprecated Use `selectionOutline.color` instead */
    selectionOutlineColor?: string;
    /** @deprecated Use `selectionOutline.offset` instead */
    outlineOffset?: number;
    /** Customize the selection outline (color, style, width, offset) */
    selectionOutline?: SelectionOutline;
    /** Z-index for the group box */
    zIndex?: number;
    /** Group selection menu render function */
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
  }>(),
  {
    selectionOutlineColor: '#007ACC',
    outlineOffset: 2,
    zIndex: 100,
    isRotatable: true,
    lockAspectRatio: false,
  },
);

const slots = useSlots();
const { plugin: annotationPlugin } = useAnnotationPlugin();
const permissions = useDocumentPermissions(() => props.documentId);
const gestureBase = shallowRef<Rect | null>(null);
const isDraggingRef = ref(false);
const isResizingRef = ref(false);
const liveRotation = ref<number | null>(null);
const cursorScreen = ref<{ x: number; y: number } | null>(null);
const isHandleHovered = ref(false);

// Check permissions before allowing drag/resize/rotate
const effectiveIsDraggable = computed(
  () => permissions.value.canModifyAnnotations && props.isDraggable,
);
const effectiveIsResizable = computed(
  () => permissions.value.canModifyAnnotations && props.isResizable,
);
const effectiveIsRotatable = computed(
  () => permissions.value.canModifyAnnotations && props.isRotatable,
);

// UI constants
const HANDLE_COLOR = computed(() => props.resizeUi?.color ?? '#007ACC');
const HANDLE_SIZE = computed(() => props.resizeUi?.size ?? 12);
const ROTATION_SIZE = computed(() => props.rotationUi?.size ?? 32);
const ROTATION_COLOR = computed(() => props.rotationUi?.color ?? HANDLE_COLOR.value);
const ROTATION_CONNECTOR_COLOR = computed(
  () => props.rotationUi?.connectorColor ?? ROTATION_COLOR.value,
);
const ROTATION_ICON_COLOR = computed(() => props.rotationUi?.iconColor ?? 'white');
const SHOW_CONNECTOR = computed(() => props.rotationUi?.showConnector ?? false);
const ROTATION_MARGIN = computed(() => props.rotationUi?.margin);

// Outline resolution (new object > deprecated props > group defaults)
const outlineColor = computed(
  () => props.selectionOutline?.color ?? props.selectionOutlineColor ?? '#007ACC',
);
const outlineStyleVal = computed(() => props.selectionOutline?.style ?? 'dashed');
const outlineWidth = computed(() => props.selectionOutline?.width ?? 2);
const outlineOff = computed(() => props.selectionOutline?.offset ?? props.outlineOffset ?? 2);

// Rotation display
const groupRotationDisplay = computed(() => liveRotation.value ?? 0);
const rotationActive = computed(() => liveRotation.value !== null);
const normalizedRotationDisplay = computed(() => {
  const val = groupRotationDisplay.value;
  return Number.isFinite(val) ? Math.round(val * 10) / 10 : 0;
});
const rotationIconSize = computed(() => Math.round(ROTATION_SIZE.value * 0.6));

// Compute the group bounding box from all selected annotations
const groupBox = computed(() => {
  const rects = props.selectedAnnotations.map((ta) => ta.object.rect);
  return boundingRectOrEmpty(rects);
});

// Preview state for the group box during drag/resize
const previewGroupBox = shallowRef<Rect>(groupBox.value);

// Watch for groupBox changes and sync previewGroupBox when not dragging/resizing
watch(
  () => groupBox.value,
  (newGroupBox) => {
    if (!isDraggingRef.value && !isResizingRef.value) {
      previewGroupBox.value = newGroupBox;
    }
  },
  { immediate: true },
);

// Subscribe to rotation end/cancel events
watch(
  () => annotationPlugin.value,
  (plugin, _old, onCleanup) => {
    if (!plugin) return;
    const unsub = plugin.onRotateChange((event: { documentId: string; type: string }) => {
      if (event.documentId !== props.documentId) return;
      if (event.type === 'end' || event.type === 'cancel') {
        liveRotation.value = null;
      }
    });
    onCleanup(unsub);
  },
  { immediate: true },
);

// Layout computations
const groupBoxWidth = computed(() => previewGroupBox.value.size.width * props.scale);
const groupBoxHeight = computed(() => previewGroupBox.value.size.height * props.scale);
const groupCenterX = computed(() => groupBoxWidth.value / 2);
const groupCenterY = computed(() => groupBoxHeight.value / 2);
const groupGuideLength = computed(() =>
  Math.max(300, Math.max(groupBoxWidth.value, groupBoxHeight.value) + 80),
);

// ─── Extracted style computations ──────────────────────────────────────
const contentsStyle: CSSProperties = { display: 'contents' };

const outerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${previewGroupBox.value.origin.x * props.scale}px`,
  top: `${previewGroupBox.value.origin.y * props.scale}px`,
  width: `${groupBoxWidth.value}px`,
  height: `${groupBoxHeight.value}px`,
  pointerEvents: 'none',
  zIndex: props.zIndex,
}));

const boxStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: `${groupBoxWidth.value}px`,
  height: `${groupBoxHeight.value}px`,
  outline: rotationActive.value
    ? 'none'
    : `${outlineWidth.value}px ${outlineStyleVal.value} ${outlineColor.value}`,
  outlineOffset: `${outlineOff.value - 1}px`,
  cursor: effectiveIsDraggable.value ? 'move' : 'default',
  touchAction: 'none',
  pointerEvents: 'auto',
}));

const guideHorizontalStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${groupCenterX.value - groupGuideLength.value / 2}px`,
  top: `${groupCenterY.value}px`,
  width: `${groupGuideLength.value}px`,
  height: '1px',
  backgroundColor: HANDLE_COLOR.value,
  opacity: 0.35,
  pointerEvents: 'none',
}));

const guideVerticalStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${groupCenterX.value}px`,
  top: `${groupCenterY.value - groupGuideLength.value / 2}px`,
  width: '1px',
  height: `${groupGuideLength.value}px`,
  backgroundColor: HANDLE_COLOR.value,
  opacity: 0.35,
  pointerEvents: 'none',
}));

const guideAngleStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${groupCenterX.value - groupGuideLength.value / 2}px`,
  top: `${groupCenterY.value}px`,
  width: `${groupGuideLength.value}px`,
  height: '1px',
  transformOrigin: 'center center',
  transform: `rotate(${groupRotationDisplay.value}deg)`,
  backgroundColor: HANDLE_COLOR.value,
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

const rotationHandleBindings = computed(() => {
  if (!rotationHandleData.value) return {};
  const { style: _s, ...rest } = rotationHandleData.value.handle;
  return rest;
});

const rotationHandleSlotProps = computed<RotationHandleSlotProps | Record<string, never>>(() => {
  if (!rotationHandleData.value) return {} as Record<string, never>;
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

// Menu rect for counter-rotate component
const menuRect = computed<Rect>(() => ({
  origin: {
    x: previewGroupBox.value.origin.x * props.scale,
    y: previewGroupBox.value.origin.y * props.scale,
  },
  size: {
    width: previewGroupBox.value.size.width * props.scale,
    height: previewGroupBox.value.size.height * props.scale,
  },
}));

// Menu context
const menuContext = computed<GroupSelectionContext>(() => ({
  type: 'group',
  annotations: props.selectedAnnotations,
  pageIndex: props.pageIndex,
}));

// Placement hints - calculate suggestTop based on rotation handle position
const menuPlacement = computed<SelectionMenuPlacement>(() => {
  const effectiveAngle = (((groupRotationDisplay.value + props.rotation * 90) % 360) + 360) % 360;
  const handleNearMenuSide =
    effectiveIsRotatable.value && effectiveAngle > 90 && effectiveAngle < 270;
  return {
    suggestTop: handleNearMenuSide,
  };
});

// Check if we should show menu
const shouldShowMenu = computed(() => {
  return props.groupSelectionMenu || slots['group-selection-menu'];
});

// Render menu via function
const renderGroupMenu = (rect: Rect, menuWrapperProps: MenuWrapperProps): VNode | null => {
  if (!props.groupSelectionMenu) return null;

  return props.groupSelectionMenu({
    rect,
    menuWrapperProps,
    selected: true,
    placement: menuPlacement.value,
    context: menuContext.value,
  });
};

// Handle pointer move on the rotation handle wrapper (for cursor tooltip when not rotating)
const onHandlePointerMove = (e: PointerEvent) => {
  if (!rotationActive.value) {
    cursorScreen.value = { x: e.clientX, y: e.clientY };
  }
};

// Element snapshot for interaction handles
const elementSnapshot = computed(() => previewGroupBox.value);

// Constraints
const constraintsSnapshot = computed(() => ({
  minWidth: 20,
  minHeight: 20,
  boundingBox: {
    width: props.pageWidth,
    height: props.pageHeight,
  },
}));

// Use interaction handles for drag, resize, and rotation
const {
  dragProps,
  resize,
  rotation: rotationHandleData,
} = useInteractionHandles({
  controller: {
    element: elementSnapshot,
    vertices: computed(() => []),
    constraints: constraintsSnapshot,
    maintainAspectRatio: computed(() => props.lockAspectRatio),
    pageRotation: computed(() => props.rotation),
    scale: computed(() => props.scale),
    enabled: computed(() => true),
    onUpdate: (event) => {
      if (!event.transformData?.type) return;
      if (!annotationPlugin.value) return;

      const plugin = annotationPlugin.value;
      const transformType = event.transformData.type;
      const isMove = transformType === 'move';
      const isResize = transformType === 'resize';

      // Skip drag operations if group is not draggable
      if (isMove && !effectiveIsDraggable.value) return;

      if (event.state === 'start') {
        gestureBase.value = groupBox.value;

        if (isMove) {
          isDraggingRef.value = true;
          plugin.startDrag(props.documentId, {
            annotationIds: props.selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: props.pageWidth, height: props.pageHeight },
          });
        } else if (isResize) {
          isResizingRef.value = true;
          plugin.startResize(props.documentId, {
            annotationIds: props.selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: props.pageWidth, height: props.pageHeight },
            resizeHandle: event.transformData.metadata?.handle ?? 'se',
          });
        }
      }

      // Handle rotation
      if (transformType === 'rotate') {
        if (!props.isRotatable) return;
        const ids = props.selectedAnnotations.map((ta) => ta.object.id);
        const cursorAngle = event.transformData.metadata?.rotationAngle ?? 0;
        const cursorPos = event.transformData.metadata?.cursorPosition;
        if (cursorPos) cursorScreen.value = { x: cursorPos.clientX, y: cursorPos.clientY };
        if (event.state === 'start') {
          liveRotation.value = cursorAngle;
          plugin.startRotation(props.documentId, {
            annotationIds: ids,
            cursorAngle,
            rotationCenter: event.transformData.metadata?.rotationCenter,
          });
        } else if (event.state === 'move') {
          liveRotation.value = cursorAngle;
          plugin.updateRotation(
            props.documentId,
            cursorAngle,
            event.transformData.metadata?.rotationDelta,
          );
        } else if (event.state === 'end') {
          liveRotation.value = null;
          cursorScreen.value = null;
          plugin.commitRotation(props.documentId);
        }
        return;
      }

      const base = gestureBase.value ?? groupBox.value;

      if (isMove && event.transformData.changes.rect) {
        const newRect = event.transformData.changes.rect;
        const rawDelta = {
          x: newRect.origin.x - base.origin.x,
          y: newRect.origin.y - base.origin.y,
        };

        const clampedDelta = plugin.updateDrag(props.documentId, rawDelta);

        previewGroupBox.value = {
          ...base,
          origin: {
            x: base.origin.x + clampedDelta.x,
            y: base.origin.y + clampedDelta.y,
          },
        };
      } else if (isResize && event.transformData.changes.rect) {
        const newGroupBox = event.transformData.changes.rect;
        plugin.updateResize(props.documentId, newGroupBox);
        previewGroupBox.value = newGroupBox;
      }

      if (event.state === 'end') {
        gestureBase.value = null;

        if (isMove && isDraggingRef.value) {
          isDraggingRef.value = false;
          plugin.commitDrag(props.documentId);
        } else if (isResize && isResizingRef.value) {
          isResizingRef.value = false;
          plugin.commitResize(props.documentId);
        }
      }
    },
  },
  resizeUI: {
    handleSize: HANDLE_SIZE.value,
    spacing: outlineOff.value,
    offsetMode: 'outside',
    includeSides: !props.lockAspectRatio,
    zIndex: props.zIndex + 1,
  },
  vertexUI: {
    vertexSize: 0,
    zIndex: props.zIndex,
  },
  rotationUI: {
    handleSize: ROTATION_SIZE.value,
    margin: ROTATION_MARGIN.value,
    zIndex: props.zIndex + 2,
    showConnector: SHOW_CONNECTOR.value,
  },
  includeVertices: false,
  includeRotation: effectiveIsRotatable,
  currentRotation: computed(() => liveRotation.value ?? 0),
});
</script>
