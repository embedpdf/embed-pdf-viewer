<template>
  <template v-for="annotation in annotations" :key="annotation.object.id">
    <template v-if="resolveRenderer(annotation)">
      <AnnotationContainer
        :trackedAnnotation="annotation"
        :isSelected="allSelectedIds.includes(annotation.object.id)"
        :isEditing="editingId === annotation.object.id"
        :isMultiSelected="isMultiSelected"
        :isDraggable="getFinalDraggable(annotation)"
        :isResizable="getResolvedResizable(annotation)"
        :lockAspectRatio="getResolvedLockAspectRatio(annotation)"
        :isRotatable="getResolvedRotatable(annotation)"
        :vertexConfig="resolveRenderer(annotation)!.vertexConfig"
        :selectionMenu="getSelectionMenu(annotation, resolveRenderer(annotation)!)"
        :onSelect="getOnSelect(annotation, resolveRenderer(annotation)!)"
        :onDoubleClick="getOnDoubleClick(resolveRenderer(annotation)!, annotation)"
        :zIndex="resolveRenderer(annotation)!.zIndex"
        :style="getContainerStyle(annotation, resolveRenderer(annotation)!)"
        :appearance="getAppearance(annotation, resolveRenderer(annotation)!)"
        v-bind="containerProps"
      >
        <template #default="{ annotation: currentObject, appearanceActive }">
          <component
            :is="resolveRenderer(annotation)!.component"
            :annotation="annotation"
            :currentObject="currentObject"
            :isSelected="allSelectedIds.includes(annotation.object.id)"
            :isEditing="editingId === annotation.object.id"
            :scale="scale"
            :pageIndex="pageIndex"
            :documentId="documentId"
            :onClick="getOnSelect(annotation, resolveRenderer(annotation)!)"
            :appearanceActive="appearanceActive"
          />
        </template>
        <template #selection-menu="slotProps" v-if="!isMultiSelected">
          <slot name="selection-menu" v-bind="slotProps" />
        </template>
        <template #resize-handle="slotProps">
          <slot name="resize-handle" v-bind="slotProps" />
        </template>
        <template #vertex-handle="slotProps">
          <slot name="vertex-handle" v-bind="slotProps" />
        </template>
        <template #rotation-handle="slotProps">
          <slot name="rotation-handle" v-bind="slotProps" />
        </template>
      </AnnotationContainer>
    </template>
  </template>

  <!-- Group Selection Box -->
  <GroupSelectionBox
    v-if="allSelectedOnSamePage && selectedAnnotationsOnPage.length >= 2"
    :documentId="documentId"
    :pageIndex="pageIndex"
    :scale="scale"
    :rotation="rotation"
    :pageWidth="pageWidth"
    :pageHeight="pageHeight"
    :selectedAnnotations="selectedAnnotationsOnPage"
    :isDraggable="areAllSelectedDraggable"
    :isResizable="areAllSelectedResizable"
    :isRotatable="areAllSelectedRotatable"
    :lockAspectRatio="shouldLockGroupAspectRatio"
    :resizeUi="resizeUi"
    :rotationUi="rotationUi"
    :selectionOutlineColor="selectionOutlineColor"
    :selectionOutline="groupSelectionOutline ?? selectionOutline"
    :groupSelectionMenu="groupSelectionMenu"
  >
    <template #selection-menu="slotProps">
      <slot name="group-selection-menu" v-bind="slotProps" />
    </template>
    <template #resize-handle="slotProps">
      <slot name="resize-handle" v-bind="slotProps" />
    </template>
    <template #rotation-handle="slotProps">
      <slot name="rotation-handle" v-bind="slotProps" />
    </template>
  </GroupSelectionBox>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect, type CSSProperties } from 'vue';
import {
  blendModeToCss,
  PdfAnnotationObject,
  PdfBlendMode,
  Position,
  AnnotationAppearanceMap,
  AnnotationAppearances,
} from '@embedpdf/models';
import {
  getAnnotationsByPageIndex,
  getSelectedAnnotationIds,
  TrackedAnnotation,
  resolveInteractionProp,
} from '@embedpdf/plugin-annotation';
import type { EmbedPdfPointerEvent } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/vue';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import { useAnnotationCapability } from '../hooks';
import AnnotationContainer from './annotation-container.vue';
import GroupSelectionBox from './group-selection-box.vue';
import {
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  ResizeHandleUI,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
} from '../types';
import type {
  BoxedAnnotationRenderer,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
} from '../context';
import { builtInRenderers } from './built-in-renderers';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  resizeUi?: ResizeHandleUI;
  vertexUi?: VertexHandleUI;
  rotationUi?: RotationHandleUI;
  selectionOutlineColor?: string;
  selectionOutline?: SelectionOutline;
  groupSelectionOutline?: SelectionOutline;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  annotationRenderers?: BoxedAnnotationRenderer[];
}>();

const { provides: annotationCapability } = useAnnotationCapability();
const { provides: selectionProvides } = useSelectionCapability();
const annotations = ref<TrackedAnnotation[]>([]);
const allSelectedIds = ref<string[]>([]);
const { register } = usePointerHandlers({
  documentId: () => props.documentId,
  pageIndex: props.pageIndex,
});
const editingId = ref<string | null>(null);
const appearanceMap = ref<AnnotationAppearanceMap>({});
let prevScale = props.scale;

const annotationProvides = computed(() =>
  annotationCapability.value ? annotationCapability.value.forDocument(props.documentId) : null,
);

const isMultiSelected = computed(() => allSelectedIds.value.length > 1);

// Merge renderers: external renderers override built-ins by ID
const allRenderers = computed(() => {
  const external = props.annotationRenderers ?? [];
  const externalIds = new Set(external.map((r) => r.id));
  return [...external, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
});

const resolveRenderer = (annotation: TrackedAnnotation): BoxedAnnotationRenderer | null => {
  return allRenderers.value.find((r) => r.matches(annotation.object)) ?? null;
};

const getAppearanceForAnnotation = (ta: TrackedAnnotation): AnnotationAppearances | null => {
  if (ta.dictMode) return null;
  if (ta.object.rotation && ta.object.unrotatedRect) return null;
  const appearances = appearanceMap.value[ta.object.id];
  if (!appearances?.normal) return null;
  return appearances;
};

// Subscribe to annotation state
watchEffect((onCleanup) => {
  if (annotationProvides.value) {
    const currentState = annotationProvides.value.getState();
    annotations.value = getAnnotationsByPageIndex(currentState, props.pageIndex);
    allSelectedIds.value = getSelectedAnnotationIds(currentState);

    const off = annotationProvides.value.onStateChange((state) => {
      annotations.value = getAnnotationsByPageIndex(state, props.pageIndex);
      allSelectedIds.value = getSelectedAnnotationIds(state);
    });
    onCleanup(off);
  }
});

// Fetch appearance map, invalidate on scale change
watchEffect(() => {
  if (!annotationProvides.value) return;

  if (prevScale !== props.scale) {
    annotationProvides.value.invalidatePageAppearances(props.pageIndex);
    prevScale = props.scale;
  }

  const task = annotationProvides.value.getPageAppearances(props.pageIndex, {
    scaleFactor: props.scale,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  });
  task.wait(
    (map) => (appearanceMap.value = map),
    () => (appearanceMap.value = {}),
  );
});

const handlePointerDown = (_pos: Position, pe: EmbedPdfPointerEvent<PointerEvent>) => {
  if (pe.target === pe.currentTarget && annotationProvides.value) {
    annotationProvides.value.deselectAnnotation();
    editingId.value = null;
  }
};

const handleClick = (e: AnnotationInteractionEvent, annotation: TrackedAnnotation) => {
  e.stopPropagation();
  if (annotationProvides.value && selectionProvides.value) {
    selectionProvides.value.clear();

    const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

    if (isModifierPressed) {
      annotationProvides.value.toggleSelection(props.pageIndex, annotation.object.id);
    } else {
      annotationProvides.value.selectAnnotation(props.pageIndex, annotation.object.id);
    }

    if (annotation.object.id !== editingId.value) {
      editingId.value = null;
    }
  }
};

const setEditingId = (id: string) => {
  editingId.value = id;
};

watchEffect((onCleanup) => {
  if (annotationProvides.value) {
    const unregister = register({ onPointerDown: handlePointerDown });
    if (unregister) {
      onCleanup(unregister);
    }
  }
});

const selectedAnnotationsOnPage = computed(() =>
  annotations.value.filter((anno) => allSelectedIds.value.includes(anno.object.id)),
);

const areAllSelectedDraggable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;
  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupDraggable = resolveInteractionProp(
      tool?.interaction.isGroupDraggable,
      ta.object,
      true,
    );
    const singleDraggable = resolveInteractionProp(tool?.interaction.isDraggable, ta.object, true);
    return tool?.interaction.isGroupDraggable !== undefined ? groupDraggable : singleDraggable;
  });
});

const areAllSelectedResizable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;
  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupResizable = resolveInteractionProp(
      tool?.interaction.isGroupResizable,
      ta.object,
      true,
    );
    const singleResizable = resolveInteractionProp(tool?.interaction.isResizable, ta.object, true);
    return tool?.interaction.isGroupResizable !== undefined ? groupResizable : singleResizable;
  });
});

const areAllSelectedRotatable = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;
  return selectedAnnotationsOnPage.value.every((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupRotatable = resolveInteractionProp(
      tool?.interaction.isGroupRotatable,
      ta.object,
      true,
    );
    const singleRotatable = resolveInteractionProp(tool?.interaction.isRotatable, ta.object, true);
    return tool?.interaction.isGroupRotatable !== undefined ? groupRotatable : singleRotatable;
  });
});

const shouldLockGroupAspectRatio = computed(() => {
  if (selectedAnnotationsOnPage.value.length < 2) return false;
  return selectedAnnotationsOnPage.value.some((ta) => {
    const tool = annotationProvides.value?.findToolForAnnotation(ta.object);
    const groupLock = resolveInteractionProp(
      tool?.interaction.lockGroupAspectRatio,
      ta.object,
      false,
    );
    const singleLock = resolveInteractionProp(tool?.interaction.lockAspectRatio, ta.object, false);
    return tool?.interaction.lockGroupAspectRatio !== undefined ? groupLock : singleLock;
  });
});

const allSelectedOnSamePage = computed(() => {
  if (!annotationProvides.value) return false;
  if (allSelectedIds.value.length < 2) return false;
  const allSelected = annotationProvides.value.getSelectedAnnotations();
  return allSelected.every((ta) => ta.object.pageIndex === props.pageIndex);
});

// --- Renderer resolution helpers ---

const getFinalDraggable = (annotation: TrackedAnnotation) => {
  const renderer = resolveRenderer(annotation);
  if (!renderer) return false;
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  const defaults = renderer.interactionDefaults;
  const isEditing = editingId.value === annotation.object.id;
  const resolvedDraggable = resolveInteractionProp(
    tool?.interaction.isDraggable,
    annotation.object,
    defaults?.isDraggable ?? true,
  );
  return renderer.isDraggable
    ? renderer.isDraggable(resolvedDraggable, { isEditing })
    : resolvedDraggable;
};

const getResolvedResizable = (annotation: TrackedAnnotation) => {
  const renderer = resolveRenderer(annotation);
  if (!renderer) return false;
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  return resolveInteractionProp(
    tool?.interaction.isResizable,
    annotation.object,
    renderer.interactionDefaults?.isResizable ?? false,
  );
};

const getResolvedLockAspectRatio = (annotation: TrackedAnnotation) => {
  const renderer = resolveRenderer(annotation);
  if (!renderer) return false;
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  return resolveInteractionProp(
    tool?.interaction.lockAspectRatio,
    annotation.object,
    renderer.interactionDefaults?.lockAspectRatio ?? false,
  );
};

const getResolvedRotatable = (annotation: TrackedAnnotation) => {
  const renderer = resolveRenderer(annotation);
  if (!renderer) return false;
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  return resolveInteractionProp(
    tool?.interaction.isRotatable,
    annotation.object,
    renderer.interactionDefaults?.isRotatable ?? false,
  );
};

const getSelectionMenu = (annotation: TrackedAnnotation, renderer: BoxedAnnotationRenderer) => {
  if (renderer.hideSelectionMenu?.(annotation.object)) return undefined;
  if (isMultiSelected.value) return undefined;
  return props.selectionMenu;
};

const getOnSelect = (annotation: TrackedAnnotation, renderer: BoxedAnnotationRenderer) => {
  if (renderer.selectOverride) {
    const selectHelpers: SelectOverrideHelpers = {
      defaultSelect: handleClick,
      selectAnnotation: (pi: number, id: string) =>
        annotationProvides.value?.selectAnnotation(pi, id),
      clearSelection: () => selectionProvides.value?.clear(),
      allAnnotations: annotations.value,
      pageIndex: props.pageIndex,
    };
    return (e: AnnotationInteractionEvent) =>
      renderer.selectOverride!(e, annotation, selectHelpers);
  }
  return (e: AnnotationInteractionEvent) => handleClick(e, annotation);
};

const getOnDoubleClick = (renderer: BoxedAnnotationRenderer, annotation: TrackedAnnotation) => {
  if (!renderer.onDoubleClick) return undefined;
  return (e: AnnotationInteractionEvent) => {
    e.stopPropagation();
    renderer.onDoubleClick!(annotation.object.id, setEditingId);
  };
};

const getContainerStyle = (
  annotation: TrackedAnnotation,
  renderer: BoxedAnnotationRenderer,
): CSSProperties => {
  return (
    renderer.containerStyle?.(annotation.object) ?? {
      mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
    }
  );
};

const getAppearance = (
  annotation: TrackedAnnotation,
  renderer: BoxedAnnotationRenderer,
): AnnotationAppearances | null | undefined => {
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  const useAP = tool?.behavior?.useAppearanceStream ?? renderer.useAppearanceStream ?? true;
  return useAP ? getAppearanceForAnnotation(annotation) : undefined;
};

const containerProps = computed(() => {
  const {
    selectionMenu: _sm,
    groupSelectionMenu: _gsm,
    groupSelectionOutline: _gso,
    annotationRenderers: _ar,
    ...rest
  } = props;
  return rest;
});
</script>
