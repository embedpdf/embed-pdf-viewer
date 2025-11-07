<template>
  <div data-no-interaction>
    <div v-bind="{ ...dragProps, ...doubleProps }" :style="containerStyle">
      <slot :annotation="currentObject"></slot>

      <template v-if="isSelected && isResizable">
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

      <template v-if="isSelected && vertices.length > 0">
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

    <CounterRotate
      :rect="{
        origin: {
          x: currentObject.rect.origin.x * scale,
          y: currentObject.rect.origin.y * scale,
        },
        size: {
          width: currentObject.rect.size.width * scale,
          height: currentObject.rect.size.height * scale,
        },
      }"
      :rotation="rotation"
    >
      <template #default="{ rect, menuWrapperProps }">
        <slot
          name="selection-menu"
          :annotation="trackedAnnotation"
          :selected="isSelected"
          :rect="rect"
          :menu-wrapper-props="menuWrapperProps"
        />
      </template>
    </CounterRotate>
  </div>
</template>

<script setup lang="ts" generic="T extends PdfAnnotationObject">
import { ref, computed, watch, useSlots, toRaw, shallowRef } from 'vue';
import { PdfAnnotationObject } from '@embedpdf/models';
import { CounterRotate, useDoublePressProps, useInteractionHandles } from '@embedpdf/utils/vue';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { VertexConfig } from '../../shared/types';
import { useAnnotationCapability } from '../hooks';

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
    outlineOffset?: number;
    onDoubleClick?: (event: PointerEvent | MouseEvent) => void;
    onSelect: (event: TouchEvent | MouseEvent) => void;
    zIndex?: number;
    selectionOutlineColor?: string;
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
const gestureBaseRef = ref<T | null>(null);

// Get scoped API for this document (similar to React's useMemo)
const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

const currentObject = computed<T>(
  () => ({ ...toRaw(props.trackedAnnotation.object), ...toRaw(preview.value) }) as T,
);

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

const doubleProps = useDoublePressProps(props.onDoubleClick);

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
  cursor: props.isSelected && props.isDraggable ? 'move' : 'default',
  zIndex: props.zIndex,
}));

// Add useSlots to access slot information
const slots = useSlots();
</script>
