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
  hasNoViewFlag,
  hasHiddenFlag,
  TrackedAnnotation,
  LockMode,
  LockModeType,
  resolveInteractionProp,
} from '@embedpdf/plugin-annotation';
import { PointerEventHandlers, EmbedPdfPointerEvent } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { useSelectionCapability } from '@embedpdf/plugin-selection/@framework';
import { useMemo, useState, useEffect, useCallback, MouseEvent, useRef } from '@framework';

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
  const [appearanceMap, setAppearanceMap] = useState<AnnotationAppearanceMap<Blob>>({});
  // Locked mode is tracked to force re-renders when it changes; the predicates on
  // `annotationProvides` (isAnnotationInteractive/StructurallyLocked/ContentLocked)
  // read document state internally.
  const [, setLockedMode] = useState<LockMode>({ type: LockModeType.None });
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
      setLockedMode(currentState.locked);

      return annotationProvides.onStateChange((state) => {
        setAnnotations(getAnnotationsByPageIndex(state, pageIndex));
        setAllSelectedIds(getSelectedAnnotationIds(state));
        setLockedMode(state.locked);
      });
    }
  }, [annotationProvides, pageIndex]);

  useEffect(() => {
    if (!annotationProvides) return;
    return annotationProvides.onAnnotationEvent((event) => {
      if (event.type === 'create' && event.editAfterCreate) {
        setEditingId(event.annotation.id);
      }
    });
  }, [annotationProvides]);

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
          if (editingId && annotations.some((a) => a.object.id === editingId)) {
            pe.stopImmediatePropagation();
          }
          annotationProvides.deselectAnnotation();
          setEditingId(null);
        }
      },
    }),
    [annotationProvides, editingId, annotations],
  );

  const handleClick = useCallback(
    (e: MouseEvent, annotation: TrackedAnnotation) => {
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
    (ta: TrackedAnnotation): AnnotationAppearances<Blob> | null => {
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

        // noView (PDF 1.3): do not render on screen and do not allow user interaction.
        // Skipping the container removes both the visual layer and the interaction layer.
        if (hasNoViewFlag(annotation.object)) return null;
        // hidden (PDF 1.1): do not render, do not interact, do not print.
        // Print suppression lives in the engine render pipeline; here we only skip UI.
        if (hasHiddenFlag(annotation.object)) return null;

        const tool = annotationProvides?.findToolForAnnotation(annotation.object) ?? null;
        const nonInteractive = annotationProvides
          ? !annotationProvides.isAnnotationInteractive(annotation.object)
          : false;
        const structurallyLocked = annotationProvides
          ? annotationProvides.isAnnotationStructurallyLocked(annotation.object)
          : false;
        const contentLocked = annotationProvides
          ? annotationProvides.isAnnotationContentLocked(annotation.object)
          : false;
        // Hidden when locked = skip entirely (e.g., form widgets defer to form-filling layer)
        if (nonInteractive && renderer.hiddenWhenLocked) return null;

        const hasRenderLocked = nonInteractive && !!renderer.renderLocked;

        const isSelected = nonInteractive ? false : allSelectedIds.includes(annotation.object.id);
        const isEditing = nonInteractive ? false : editingId === annotation.object.id;
        const defaults = renderer.interactionDefaults;

        const resolvedDraggable = resolveInteractionProp(
          tool?.interaction.isDraggable,
          annotation.object,
          defaults?.isDraggable ?? true,
        );
        const finalDraggable = structurallyLocked
          ? false
          : renderer.isDraggable
            ? renderer.isDraggable(resolvedDraggable, { isEditing })
            : resolvedDraggable;

        const useAP = tool?.behavior?.useAppearanceStream ?? renderer.useAppearanceStream ?? true;
        const appearance = hasRenderLocked
          ? undefined
          : useAP
            ? getAppearanceForAnnotation(annotation)
            : undefined;

        const noopSelect = (e: AnnotationInteractionEvent) => {
          e.stopPropagation();
        };
        const onSelect = nonInteractive
          ? noopSelect
          : renderer.selectOverride
            ? (e: AnnotationInteractionEvent) =>
                renderer.selectOverride!(e, annotation, selectHelpers)
            : (e: AnnotationInteractionEvent) => handleClick(e, annotation);

        return (
          <AnnotationContainer
            key={annotation.object.id}
            trackedAnnotation={annotation}
            isSelected={isSelected}
            isEditing={isEditing}
            isMultiSelected={nonInteractive ? false : isMultiSelected}
            isDraggable={finalDraggable}
            isResizable={
              structurallyLocked
                ? false
                : resolveInteractionProp(
                    tool?.interaction.isResizable,
                    annotation.object,
                    defaults?.isResizable ?? false,
                  )
            }
            lockAspectRatio={resolveInteractionProp(
              tool?.interaction.lockAspectRatio,
              annotation.object,
              defaults?.lockAspectRatio ?? false,
            )}
            isRotatable={
              structurallyLocked
                ? false
                : resolveInteractionProp(
                    tool?.interaction.isRotatable,
                    annotation.object,
                    defaults?.isRotatable ?? false,
                  )
            }
            vertexConfig={structurallyLocked ? undefined : renderer.vertexConfig}
            selectionMenu={
              nonInteractive
                ? undefined
                : renderer.hideSelectionMenu?.(annotation.object)
                  ? undefined
                  : selectionMenu
            }
            structurallyLocked={structurallyLocked}
            contentLocked={contentLocked}
            onSelect={onSelect}
            onDoubleClick={
              nonInteractive || contentLocked
                ? undefined
                : renderer.onDoubleClick
                  ? (e: AnnotationInteractionEvent) => {
                      e.stopPropagation();
                      renderer.onDoubleClick!(annotation.object.id, setEditingId);
                    }
                  : undefined
            }
            zIndex={renderer.zIndex}
            blendMode={blendModeToCss(
              annotation.object.blendMode ?? renderer.defaultBlendMode ?? PdfBlendMode.Normal,
            )}
            style={renderer.containerStyle?.(annotation.object)}
            appearance={appearance}
            {...annotationsProps}
          >
            {(currentObject, { appearanceActive }) => {
              if (hasRenderLocked) {
                return renderer.renderLocked!({
                  annotation,
                  currentObject,
                  isSelected: false,
                  isEditing: false,
                  scale,
                  pageIndex,
                  documentId,
                  onClick: undefined,
                  appearanceActive,
                });
              }
              return renderer.render({
                annotation,
                currentObject,
                isSelected,
                isEditing,
                scale,
                pageIndex,
                documentId,
                onClick: nonInteractive ? undefined : onSelect,
                appearanceActive,
              });
            }}
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
