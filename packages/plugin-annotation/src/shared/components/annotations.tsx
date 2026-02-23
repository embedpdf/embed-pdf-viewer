import {
  blendModeToCss,
  PdfAnnotationObject,
  PdfBlendMode,
  AnnotationAppearanceMap,
  AnnotationAppearances,
} from '@embedpdf/models';
import {
  getAnnotationsByPageIndex,
  getSelectedAnnotationIds,
  TrackedAnnotation,
  resolveInteractionProp,
} from '@embedpdf/plugin-annotation';
import { PointerEventHandlers, EmbedPdfPointerEvent } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { useSelectionCapability } from '@embedpdf/plugin-selection/@framework';
import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  MouseEvent,
  TouchEvent,
  useRef,
} from '@framework';

import { useAnnotationCapability } from '../hooks';
import { AnnotationContainer } from './annotation-container';
import { GroupSelectionBox } from './group-selection-box';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
  BoxedAnnotationRenderer,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
} from './types';
import { builtInRenderers } from './built-in-renderers';

interface AnnotationsProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  rotationUI?: RotationHandleUI;
  selectionOutlineColor?: string;
  selectionOutline?: SelectionOutline;
  groupSelectionOutline?: SelectionOutline;
  customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
  annotationRenderers?: BoxedAnnotationRenderer[];
}

export function Annotations(annotationsProps: AnnotationsProps) {
  const { documentId, pageIndex, scale, pageWidth, pageHeight, selectionMenu } = annotationsProps;
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: selectionProvides } = useSelectionCapability();
  const [annotations, setAnnotations] = useState<TrackedAnnotation[]>([]);
  const { register } = usePointerHandlers({ documentId, pageIndex });
  const [allSelectedIds, setAllSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [appearanceMap, setAppearanceMap] = useState<AnnotationAppearanceMap>({});
  const prevScaleRef = useRef<number>(scale);

  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  const isMultiSelected = allSelectedIds.length > 1;

  useEffect(() => {
    if (annotationProvides) {
      const currentState = annotationProvides.getState();
      setAnnotations(getAnnotationsByPageIndex(currentState, pageIndex));
      setAllSelectedIds(getSelectedAnnotationIds(currentState));

      return annotationProvides.onStateChange((state) => {
        setAnnotations(getAnnotationsByPageIndex(state, pageIndex));
        setAllSelectedIds(getSelectedAnnotationIds(state));
      });
    }
  }, [annotationProvides, pageIndex]);

  useEffect(() => {
    if (!annotationProvides) return;

    if (prevScaleRef.current !== scale) {
      annotationProvides.invalidatePageAppearances(pageIndex);
      prevScaleRef.current = scale;
    }

    const task = annotationProvides.getPageAppearances(pageIndex, {
      scaleFactor: scale,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    });
    task.wait(
      (map) => setAppearanceMap(map),
      () => setAppearanceMap({}),
    );
  }, [annotationProvides, pageIndex, scale]);

  const handlers = useMemo(
    (): PointerEventHandlers<EmbedPdfPointerEvent<MouseEvent>> => ({
      onPointerDown: (_, pe) => {
        if (pe.target === pe.currentTarget && annotationProvides) {
          annotationProvides.deselectAnnotation();
          setEditingId(null);
        }
      },
    }),
    [annotationProvides],
  );

  const handleClick = useCallback(
    (e: MouseEvent | TouchEvent, annotation: TrackedAnnotation) => {
      e.stopPropagation();
      if (annotationProvides && selectionProvides) {
        selectionProvides.clear();

        const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

        if (isModifierPressed) {
          annotationProvides.toggleSelection(pageIndex, annotation.object.id);
        } else {
          annotationProvides.selectAnnotation(pageIndex, annotation.object.id);
        }

        if (annotation.object.id !== editingId) {
          setEditingId(null);
        }
      }
    },
    [annotationProvides, selectionProvides, editingId, pageIndex],
  );

  useEffect(() => {
    return register(handlers, {
      documentId,
    });
  }, [register, handlers]);

  const selectedAnnotationsOnPage = useMemo(() => {
    return annotations.filter((anno) => allSelectedIds.includes(anno.object.id));
  }, [annotations, allSelectedIds]);

  const areAllSelectedDraggable = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupDraggable = resolveInteractionProp(
        tool?.interaction.isGroupDraggable,
        ta.object,
        true,
      );
      const singleDraggable = resolveInteractionProp(
        tool?.interaction.isDraggable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupDraggable !== undefined ? groupDraggable : singleDraggable;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  const areAllSelectedResizable = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupResizable = resolveInteractionProp(
        tool?.interaction.isGroupResizable,
        ta.object,
        true,
      );
      const singleResizable = resolveInteractionProp(
        tool?.interaction.isResizable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupResizable !== undefined ? groupResizable : singleResizable;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  const areAllSelectedRotatable = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupRotatable = resolveInteractionProp(
        tool?.interaction.isGroupRotatable,
        ta.object,
        true,
      );
      const singleRotatable = resolveInteractionProp(
        tool?.interaction.isRotatable,
        ta.object,
        true,
      );
      return tool?.interaction.isGroupRotatable !== undefined ? groupRotatable : singleRotatable;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  const shouldLockGroupAspectRatio = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.some((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      const groupLock = resolveInteractionProp(
        tool?.interaction.lockGroupAspectRatio,
        ta.object,
        false,
      );
      const singleLock = resolveInteractionProp(
        tool?.interaction.lockAspectRatio,
        ta.object,
        false,
      );
      return tool?.interaction.lockGroupAspectRatio !== undefined ? groupLock : singleLock;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  const allSelectedOnSamePage = useMemo(() => {
    if (!annotationProvides) return false;
    const allSelected = annotationProvides.getSelectedAnnotations();
    return allSelected.length > 1 && allSelected.every((ta) => ta.object.pageIndex === pageIndex);
  }, [annotationProvides, pageIndex, allSelectedIds]);

  const getAppearanceForAnnotation = useCallback(
    (ta: TrackedAnnotation): AnnotationAppearances | null => {
      if (ta.dictMode) return null;
      if (ta.object.rotation && ta.object.unrotatedRect) return null;
      const appearances = appearanceMap[ta.object.id];
      if (!appearances?.normal) return null;
      return appearances;
    },
    [appearanceMap],
  );

  // Merge renderers: external renderers override built-ins by ID
  const allRenderers = useMemo(() => {
    const external = annotationsProps.annotationRenderers ?? [];
    const externalIds = new Set(external.map((r) => r.id));
    return [...external, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
  }, [annotationsProps.annotationRenderers]);

  const resolveRenderer = useCallback(
    (annotation: TrackedAnnotation) =>
      allRenderers.find((r) => r.matches(annotation.object)) ?? null,
    [allRenderers],
  );

  // Stable helpers object for selectOverride
  const selectHelpers = useMemo(
    (): SelectOverrideHelpers => ({
      defaultSelect: handleClick,
      selectAnnotation: (pi: number, id: string) => annotationProvides?.selectAnnotation(pi, id),
      clearSelection: () => selectionProvides?.clear(),
      allAnnotations: annotations,
      pageIndex,
    }),
    [handleClick, annotationProvides, selectionProvides, annotations, pageIndex],
  );

  return (
    <>
      {annotations.map((annotation) => {
        const renderer = resolveRenderer(annotation);
        if (!renderer) return null;

        const tool = annotationProvides?.findToolForAnnotation(annotation.object);
        const isSelected = allSelectedIds.includes(annotation.object.id);
        const isEditing = editingId === annotation.object.id;
        const defaults = renderer.interactionDefaults;

        const resolvedDraggable = resolveInteractionProp(
          tool?.interaction.isDraggable,
          annotation.object,
          defaults?.isDraggable ?? true,
        );
        const finalDraggable = renderer.isDraggable
          ? renderer.isDraggable(resolvedDraggable, { isEditing })
          : resolvedDraggable;

        const useAP = tool?.behavior?.useAppearanceStream ?? renderer.useAppearanceStream ?? true;

        const onSelect = renderer.selectOverride
          ? (e: AnnotationInteractionEvent) =>
              renderer.selectOverride!(e, annotation, selectHelpers)
          : (e: AnnotationInteractionEvent) => handleClick(e, annotation);

        return (
          <AnnotationContainer
            key={annotation.object.id}
            trackedAnnotation={annotation}
            isSelected={isSelected}
            isEditing={isEditing}
            isMultiSelected={isMultiSelected}
            isDraggable={finalDraggable}
            isResizable={resolveInteractionProp(
              tool?.interaction.isResizable,
              annotation.object,
              defaults?.isResizable ?? false,
            )}
            lockAspectRatio={resolveInteractionProp(
              tool?.interaction.lockAspectRatio,
              annotation.object,
              defaults?.lockAspectRatio ?? false,
            )}
            isRotatable={resolveInteractionProp(
              tool?.interaction.isRotatable,
              annotation.object,
              defaults?.isRotatable ?? false,
            )}
            vertexConfig={renderer.vertexConfig}
            selectionMenu={
              renderer.hideSelectionMenu?.(annotation.object) ? undefined : selectionMenu
            }
            onSelect={onSelect}
            onDoubleClick={
              renderer.onDoubleClick
                ? (e: AnnotationInteractionEvent) => {
                    e.stopPropagation();
                    renderer.onDoubleClick!(annotation.object.id, setEditingId);
                  }
                : undefined
            }
            zIndex={renderer.zIndex}
            style={
              renderer.containerStyle?.(annotation.object) ?? {
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }
            }
            appearance={useAP ? getAppearanceForAnnotation(annotation) : undefined}
            {...annotationsProps}
          >
            {(currentObject, { appearanceActive }) =>
              renderer.render({
                annotation,
                currentObject,
                isSelected,
                isEditing,
                scale,
                pageIndex,
                documentId,
                onClick: onSelect,
                appearanceActive,
              })
            }
          </AnnotationContainer>
        );
      })}

      {allSelectedOnSamePage && selectedAnnotationsOnPage.length >= 2 && (
        <GroupSelectionBox
          documentId={documentId}
          pageIndex={pageIndex}
          scale={scale}
          rotation={annotationsProps.rotation}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          selectedAnnotations={selectedAnnotationsOnPage}
          isDraggable={areAllSelectedDraggable}
          isResizable={areAllSelectedResizable}
          isRotatable={areAllSelectedRotatable}
          lockAspectRatio={shouldLockGroupAspectRatio}
          resizeUI={annotationsProps.resizeUI}
          rotationUI={annotationsProps.rotationUI}
          selectionOutlineColor={annotationsProps.selectionOutlineColor}
          selectionOutline={
            annotationsProps.groupSelectionOutline ?? annotationsProps.selectionOutline
          }
          groupSelectionMenu={annotationsProps.groupSelectionMenu}
        />
      )}
    </>
  );
}
