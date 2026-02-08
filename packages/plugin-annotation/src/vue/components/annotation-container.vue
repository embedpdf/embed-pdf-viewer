<template>
  <div data-no-interaction :style="{ display: 'contents' }">
    <div
      v-bind="{ ...(effectiveIsDraggable && isSelected ? dragProps : {}), ...doubleProps }"
      :style="mergedContainerStyle"
    >
      <slot :annotation="currentObject"></slot>

      <!-- Resize handles - only when single-selected -->
      <template v-if="isSelected && effectiveIsResizable">
        <template v-for="{ key, style, ...handle } in resize" :key="key">
          <slot
            v-if="slots['resize-handle']"
            name="resize-handle"
            v-bind="{ key, style, ...handle, backgroundColor: HANDLE_COLOR }"
          >
            <!-- Fallback content if slot is provided but empty -->
            <div v-bind="handle" :style="[style, { backgroundColor: HANDLE_COLOR }]" />
          </slot>
          <div v-else v-bind="handle" :style="[style, { backgroundColor: HANDLE_COLOR }]" />
        </template>
      </template>

      <!-- Vertex handles - only when single-selected -->
      <template
        v-if="
          isSelected && permissions.canModifyAnnotations && !isMultiSelected && vertices.length > 0
        "
      >
        <template v-for="{ key, style, ...vertex } in vertices" :key="key">
          <slot
            v-if="slots['vertex-handle']"
            name="vertex-handle"
            v-bind="{ key, style, ...vertex, backgroundColor: VERTEX_COLOR }"
          >
            <!-- Fallback content if slot is provided but empty -->
            <div v-bind="vertex" :style="[style, { backgroundColor: VERTEX_COLOR }]" />
          </slot>
          <div v-else v-bind="vertex" :style="[style, { backgroundColor: VERTEX_COLOR }]" />
        </template>
      </template>
    </div>

    <!-- Selection Menu: Supports BOTH render function and slot - hide when multi-selected -->
    <CounterRotate v-if="shouldShowMenu" :rect="menuRect" :rotation="rotation">
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
  </div>
</template>

<script lang="ts">
// Disable attribute inheritance so style doesn't fall through to root element
export default {
  inheritAttrs: false,
};
</script>

<script setup lang="ts" generic="T extends PdfAnnotationObject">
import { ref, computed, watchEffect, useSlots, toRaw, shallowRef, VNode } from 'vue';
import { PdfAnnotationObject, Rect } from '@embedpdf/models';
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
import { AnnotationSelectionContext, AnnotationSelectionMenuRenderFn } from '../types';

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
    lockAspectRatio?: boolean;
    vertexConfig?: VertexConfig<T>;
    selectionMenu?: AnnotationSelectionMenuRenderFn;
    outlineOffset?: number;
    onDoubleClick?: (event: PointerEvent | MouseEvent) => void;
    onSelect: (event: TouchEvent | MouseEvent) => void;
    zIndex?: number;
    selectionOutlineColor?: string;
    style?: Record<string, string | number>;
  }>(),
  {
    lockAspectRatio: false,
    isMultiSelected: false,
    outlineOffset: 1,
    zIndex: 1,
    selectionOutlineColor: '#007ACC',
  },
);

const HANDLE_COLOR = '#007ACC';
const VERTEX_COLOR = '#007ACC';
const HANDLE_SIZE = 12;
const VERTEX_SIZE = 12;

const preview = shallowRef<Partial<T>>(toRaw(props.trackedAnnotation.object));
const { provides: annotationCapability } = useAnnotationCapability();
const { plugin: annotationPlugin } = useAnnotationPlugin();
const permissions = useDocumentPermissions(props.documentId);
const gestureBaseRef = ref<T | null>(null);
const gestureBaseRectRef = shallowRef<Rect | null>(null);

// When multi-selected, disable individual drag/resize - GroupSelectionBox handles it
const effectiveIsDraggable = computed(
  () => permissions.value.canModifyAnnotations && props.isDraggable && !props.isMultiSelected,
);
const effectiveIsResizable = computed(
  () => permissions.value.canModifyAnnotations && props.isResizable && !props.isMultiSelected,
);

// Wrap onDoubleClick to respect permissions - check at call time
const guardedOnDoubleClick = props.onDoubleClick
  ? (e: PointerEvent | MouseEvent) => {
      if (permissions.value.canModifyAnnotations) {
        props.onDoubleClick?.(e);
      }
    }
  : undefined;

// Get scoped API for this document (similar to React's useMemo)
const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

const currentObject = computed<T>(
  () => ({ ...toRaw(props.trackedAnnotation.object), ...toRaw(preview.value) }) as T,
);

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

// Placement hints
const menuPlacement = computed<SelectionMenuPlacement>(() => ({
  suggestTop: false, // Could calculate based on position in viewport
  spaceAbove: 0,
  spaceBelow: 0,
}));

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

const elementSnapshot = computed(() => {
  const obj = toRaw(currentObject.value);
  return obj.rect; // plain-ish; composable will normalize fully
});

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

const { dragProps, vertices, resize } = useInteractionHandles({
  controller: {
    element: elementSnapshot,
    vertices: verticesSnapshot,
    constraints: constraintsSnapshot,
    maintainAspectRatio: computed(() => props.lockAspectRatio),
    pageRotation: computed(() => props.rotation),
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
        gestureBaseRectRef.value = props.trackedAnnotation.object.rect;
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
    spacing: props.outlineOffset,
    offsetMode: 'outside',
    includeSides: !props.lockAspectRatio,
    zIndex: props.zIndex + 1,
  },
  vertexUI: {
    vertexSize: VERTEX_SIZE,
    zIndex: props.zIndex + 2,
  },
  includeVertices: !!props.vertexConfig,
});

const doubleProps = useDoublePressProps(guardedOnDoubleClick);

// Sync preview with tracked annotation when it changes
watchEffect(() => {
  if (props.trackedAnnotation.object) {
    preview.value = props.trackedAnnotation.object;
  }
});

// Subscribe to unified drag/resize changes - plugin sends pre-computed patches!
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
    const patch = event.previewPatches?.[id];
    if (event.type === 'update' && patch) {
      preview.value = { ...toRaw(preview.value), ...patch } as T;
    } else if (event.type === 'cancel') {
      preview.value = props.trackedAnnotation.object;
    }
  };

  const unsubs = [plugin.onDragChange(handleEvent), plugin.onResizeChange(handleEvent)];

  onCleanup(() => unsubs.forEach((u) => u()));
});

const containerStyle = computed(() => ({
  position: 'absolute' as 'absolute',
  left: `${currentObject.value.rect.origin.x * props.scale}px`,
  top: `${currentObject.value.rect.origin.y * props.scale}px`,
  width: `${currentObject.value.rect.size.width * props.scale}px`,
  height: `${currentObject.value.rect.size.height * props.scale}px`,
  outline: showOutline.value ? `1px solid ${props.selectionOutlineColor}` : 'none',
  outlineOffset: showOutline.value ? `${props.outlineOffset}px` : '0px',
  pointerEvents: props.isSelected && !props.isMultiSelected ? 'auto' : ('none' as 'auto' | 'none'),
  touchAction: 'none',
  cursor: props.isSelected && effectiveIsDraggable.value ? 'move' : 'default',
  zIndex: props.zIndex,
}));

// Merge container style with passed style prop (for mixBlendMode, etc.)
const mergedContainerStyle = computed(() => ({
  ...containerStyle.value,
  ...(props.style ?? {}),
}));

// Add useSlots to access slot information
const slots = useSlots();
</script>
