<template>
  <div data-no-interaction :style="{ display: 'contents' }">
    <div
      v-bind="{ ...(effectiveIsDraggable && isSelected ? dragProps : {}), ...doubleProps }"
      :style="mergedContainerStyle"
    >
      <slot :annotation="currentObject"></slot>

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

      <template v-if="isSelected && permissions.canModifyAnnotations && vertices.length > 0">
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

    <!-- Selection Menu: Supports BOTH render function and slot -->
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
import { ref, computed, watch, useSlots, toRaw, shallowRef, VNode } from 'vue';
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
import { useAnnotationCapability } from '../hooks';
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
const permissions = useDocumentPermissions(props.documentId);
const gestureBaseRef = ref<T | null>(null);

// Override props based on permission
const effectiveIsDraggable = computed(
  () => permissions.value.canModifyAnnotations && props.isDraggable,
);
const effectiveIsResizable = computed(
  () => permissions.value.canModifyAnnotations && props.isResizable,
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

// --- Selection Menu Logic ---

// Check if we should show any menu at all
const shouldShowMenu = computed(() => {
  return props.isSelected && (props.selectionMenu || slots['selection-menu']);
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
    enabled: computed(() => props.isSelected),
    onUpdate: (event) => {
      if (!event.transformData?.type) return;

      if (event.state === 'start') {
        gestureBaseRef.value = currentObject.value;
      }

      const base = gestureBaseRef.value ?? currentObject.value;

      const changes = event.transformData.changes.vertices
        ? props.vertexConfig?.transformAnnotation(toRaw(base), event.transformData.changes.vertices)
        : { rect: event.transformData.changes.rect };

      const patched = annotationCapability.value?.transformAnnotation<T>(base, {
        type: event.transformData.type,
        changes: changes as Partial<T>,
        metadata: event.transformData.metadata,
      });

      if (patched) {
        preview.value = { ...toRaw(preview.value), ...patched };
      }

      if (event.state === 'end' && patched) {
        gestureBaseRef.value = null;
        annotationProvides.value?.updateAnnotation(
          props.pageIndex,
          props.trackedAnnotation.object.id,
          patched,
        );
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

watch(
  () => props.trackedAnnotation.object,
  (newObject) => {
    preview.value = newObject;
  },
  { deep: true },
);

const containerStyle = computed(() => ({
  position: 'absolute' as 'absolute',
  left: `${currentObject.value.rect.origin.x * props.scale}px`,
  top: `${currentObject.value.rect.origin.y * props.scale}px`,
  width: `${currentObject.value.rect.size.width * props.scale}px`,
  height: `${currentObject.value.rect.size.height * props.scale}px`,
  outline: props.isSelected ? `1px solid ${props.selectionOutlineColor}` : 'none',
  outlineOffset: props.isSelected ? `${props.outlineOffset}px` : '0px',
  pointerEvents: props.isSelected ? 'auto' : ('none' as 'auto' | 'none'),
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
