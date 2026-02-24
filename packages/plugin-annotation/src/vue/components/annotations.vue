<template>
  <template v-for="{ annotation, renderer } in resolvedAnnotations" :key="annotation.object.id">
    <template v-if="renderer">
      <AnnotationContainer
        :trackedAnnotation="annotation"
        :isSelected="allSelectedIds.includes(annotation.object.id)"
        :isEditing="editingId === annotation.object.id"
        :isMultiSelected="isMultiSelected"
        :isDraggable="getFinalDraggable(annotation, renderer)"
        :isResizable="getResolvedResizable(annotation, renderer)"
        :lockAspectRatio="getResolvedLockAspectRatio(annotation, renderer)"
        :isRotatable="getResolvedRotatable(annotation, renderer)"
        :vertexConfig="renderer.vertexConfig"
        :selectionMenu="getSelectionMenu(annotation, renderer)"
        :onSelect="getOnSelect(annotation, renderer)"
        :onDoubleClick="getOnDoubleClick(renderer, annotation)"
        :zIndex="renderer.zIndex"
        :style="getContainerStyle(annotation, renderer)"
        :appearance="getAppearance(annotation, renderer)"
        v-bind="containerProps"
      >
        <template #default="{ annotation: currentObject, appearanceActive }">
          <component
            :is="renderer.component"
            :annotation="annotation"
            :currentObject="currentObject"
            :isSelected="allSelectedIds.includes(annotation.object.id)"
            :isEditing="editingId === annotation.object.id"
            :scale="scale"
            :pageIndex="pageIndex"
            :documentId="documentId"
            :onClick="getOnSelect(annotation, renderer)"
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
import { ref, shallowRef, computed, watch, type CSSProperties } from 'vue';
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
const annotations = shallowRef<TrackedAnnotation[]>([]);
const allSelectedIds = shallowRef<string[]>([]);
const { register } = usePointerHandlers({
  documentId: () => props.documentId,
  pageIndex: props.pageIndex,
});
const editingId = ref<string | null>(null);
const appearanceMap = shallowRef<AnnotationAppearanceMap<Blob>>({});
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

const getAppearanceForAnnotation = (ta: TrackedAnnotation): AnnotationAppearances<Blob> | null => {
  if (ta.dictMode) return null;
  if (ta.object.rotation && ta.object.unrotatedRect) return null;
  const appearances = appearanceMap.value[ta.object.id];
  if (!appearances?.normal) return null;
  return appearances;
};

// Subscribe to annotation state. Explicit watch dependencies avoid accidental
// reactive tracking inside provider methods that can create update loops.
watch(
  [annotationProvides, () => props.pageIndex],
  ([provides, pageIndex], _prev, onCleanup) => {
    if (!provides) {
      annotations.value = [];
      allSelectedIds.value = [];
      return;
    }

    const syncState = (state: ReturnType<typeof provides.getState>) => {
      annotations.value = getAnnotationsByPageIndex(state, pageIndex);
      allSelectedIds.value = getSelectedAnnotationIds(state);
    };

    syncState(provides.getState());
    const off = provides.onStateChange(syncState);
    onCleanup(off);
  },
  { immediate: true },
);

// Fetch appearance map, invalidate on scale change
watch(
  [annotationProvides, () => props.pageIndex, () => props.scale],
  ([provides, pageIndex, scale], _prev, onCleanup) => {
    if (!provides) {
      appearanceMap.value = {};
      return;
    }

    if (prevScale !== scale) {
      provides.invalidatePageAppearances(pageIndex);
      prevScale = scale;
    }

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const task = provides.getPageAppearances(pageIndex, {
      scaleFactor: scale,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    });
    task.wait(
      (map) => {
        if (!cancelled) appearanceMap.value = map;
      },
      () => {
        if (!cancelled) appearanceMap.value = {};
      },
    );
  },
  { immediate: true },
);

const resolvedAnnotations = computed(() =>
  annotations.value.map((annotation) => ({
    annotation,
    renderer: resolveRenderer(annotation),
  })),
);

const getFinalDraggable = (annotation: TrackedAnnotation, renderer: BoxedAnnotationRenderer) => {
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

const getResolvedResizable = (annotation: TrackedAnnotation, renderer: BoxedAnnotationRenderer) => {
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  return resolveInteractionProp(
    tool?.interaction.isResizable,
    annotation.object,
    renderer.interactionDefaults?.isResizable ?? false,
  );
};

const getResolvedLockAspectRatio = (
  annotation: TrackedAnnotation,
  renderer: BoxedAnnotationRenderer,
) => {
  const tool = annotationProvides.value?.findToolForAnnotation(annotation.object);
  return resolveInteractionProp(
    tool?.interaction.lockAspectRatio,
    annotation.object,
    renderer.interactionDefaults?.lockAspectRatio ?? false,
  );
};

const getResolvedRotatable = (annotation: TrackedAnnotation, renderer: BoxedAnnotationRenderer) => {
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

const pointerHandlers = { onPointerDown: handlePointerDown };

watch(
  annotationProvides,
  (provides, _prev, onCleanup) => {
    if (!provides) return;
    const unregister = register(pointerHandlers);
    if (unregister) {
      onCleanup(unregister);
    }
  },
  { immediate: true },
);

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
): AnnotationAppearances<Blob> | null | undefined => {
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
