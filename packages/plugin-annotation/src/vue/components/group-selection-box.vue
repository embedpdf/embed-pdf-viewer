<template>
  <div v-if="selectedAnnotations.length >= 2" data-group-selection-box data-no-interaction>
    <!-- Group box - draggable only if effectiveIsDraggable is true -->
    <div
      v-bind="effectiveIsDraggable ? dragProps : {}"
      :style="boxStyle"
      @pointerdown="!effectiveIsDraggable ? $event.stopPropagation() : undefined"
    >
      <!-- Resize handles -->
      <template v-if="effectiveIsResizable">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots, VNode, shallowRef, watch } from 'vue';
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
  GroupSelectionMenuProps,
  GroupSelectionMenuRenderFn,
  ResizeHandleUI,
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
    /** Resize handle UI customization */
    resizeUI?: ResizeHandleUI;
    /** Selection outline color */
    selectionOutlineColor?: string;
    /** Outline offset */
    outlineOffset?: number;
    /** Z-index for the group box */
    zIndex?: number;
    /** Group selection menu render function */
    groupSelectionMenu?: GroupSelectionMenuRenderFn;
  }>(),
  {
    selectionOutlineColor: '#007ACC',
    outlineOffset: 2,
    zIndex: 100,
  },
);

const slots = useSlots();
const { plugin: annotationPlugin } = useAnnotationPlugin();
const permissions = useDocumentPermissions(() => props.documentId);
const gestureBase = shallowRef<Rect | null>(null);
const isDraggingRef = ref(false);
const isResizingRef = ref(false);

// Check permissions before allowing drag/resize
const effectiveIsDraggable = computed(
  () => permissions.value.canModifyAnnotations && props.isDraggable,
);
const effectiveIsResizable = computed(
  () => permissions.value.canModifyAnnotations && props.isResizable,
);

const HANDLE_COLOR = computed(() => props.resizeUI?.color ?? '#007ACC');
const HANDLE_SIZE = computed(() => props.resizeUI?.size ?? 12);

// Compute the group bounding box from all selected annotations
const groupBox = computed(() => {
  const rects = props.selectedAnnotations.map((ta) => ta.object.rect);
  return boundingRectOrEmpty(rects);
});

// Preview state for the group box during drag/resize
const previewGroupBox = shallowRef<Rect>(groupBox.value);

// Watch for groupBox changes and sync previewGroupBox when not dragging/resizing
// Use watchEffect equivalent via computed with side effects won't work, need explicit watch
watch(
  () => groupBox.value,
  (newGroupBox) => {
    if (!isDraggingRef.value && !isResizingRef.value) {
      previewGroupBox.value = newGroupBox;
    }
  },
  { immediate: true },
);

// Box styling
const boxStyle = computed(() => ({
  position: 'absolute' as 'absolute',
  left: `${previewGroupBox.value.origin.x * props.scale}px`,
  top: `${previewGroupBox.value.origin.y * props.scale}px`,
  width: `${previewGroupBox.value.size.width * props.scale}px`,
  height: `${previewGroupBox.value.size.height * props.scale}px`,
  outline: `2px dashed ${props.selectionOutlineColor}`,
  outlineOffset: `${props.outlineOffset - 1}px`,
  cursor: effectiveIsDraggable.value ? 'move' : 'default',
  touchAction: 'none',
  zIndex: props.zIndex,
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

// Placement hints
const menuPlacement = computed<SelectionMenuPlacement>(() => ({
  suggestTop: false,
}));

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

// Use interaction handles for both drag and resize
const { dragProps, resize } = useInteractionHandles({
  controller: {
    element: elementSnapshot,
    vertices: computed(() => []),
    constraints: constraintsSnapshot,
    maintainAspectRatio: computed(() => false),
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
          // Use unified drag API - plugin handles attached links automatically
          plugin.startDrag(props.documentId, {
            annotationIds: props.selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: props.pageWidth, height: props.pageHeight },
          });
        } else if (isResize) {
          isResizingRef.value = true;
          // Use unified resize API - plugin handles attached links automatically
          plugin.startResize(props.documentId, {
            annotationIds: props.selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: props.pageWidth, height: props.pageHeight },
            resizeHandle: event.transformData.metadata?.handle ?? 'se',
          });
        }
      }

      const base = gestureBase.value ?? groupBox.value;

      if (isMove && event.transformData.changes.rect) {
        // Calculate delta from original position
        const newRect = event.transformData.changes.rect;
        const rawDelta = {
          x: newRect.origin.x - base.origin.x,
          y: newRect.origin.y - base.origin.y,
        };

        // Plugin clamps delta and emits events (attached links receive updates too)
        const clampedDelta = plugin.updateDrag(props.documentId, rawDelta);

        // Update preview group box with clamped delta
        previewGroupBox.value = {
          ...base,
          origin: {
            x: base.origin.x + clampedDelta.x,
            y: base.origin.y + clampedDelta.y,
          },
        };
      } else if (isResize && event.transformData.changes.rect) {
        const newGroupBox = event.transformData.changes.rect;

        // Plugin computes rects for all participants and emits events
        plugin.updateResize(props.documentId, newGroupBox);

        // Update preview
        previewGroupBox.value = newGroupBox;
      }

      if (event.state === 'end') {
        gestureBase.value = null;

        if (isMove && isDraggingRef.value) {
          isDraggingRef.value = false;
          // Plugin commits all patches (selected + attached links) - no patch building needed!
          plugin.commitDrag(props.documentId);
        } else if (isResize && isResizingRef.value) {
          isResizingRef.value = false;
          // Plugin commits all patches (selected + attached links) - no patch building needed!
          plugin.commitResize(props.documentId);
        }
      }
    },
  },
  resizeUI: {
    handleSize: HANDLE_SIZE.value,
    spacing: props.outlineOffset,
    offsetMode: 'outside',
    includeSides: true,
    zIndex: props.zIndex + 1,
  },
  vertexUI: {
    vertexSize: 0,
    zIndex: props.zIndex,
  },
  includeVertices: false,
});
</script>
