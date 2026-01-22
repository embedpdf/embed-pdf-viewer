import { blendModeToCss, PdfAnnotationObject, PdfBlendMode } from '@embedpdf/models';
import {
  getAnnotationsByPageIndex,
  getSelectedAnnotationIds,
  isHighlight,
  isInk,
  isSquiggly,
  isCircle,
  isStrikeout,
  isUnderline,
  TrackedAnnotation,
  isSquare,
  isLine,
  isPolyline,
  isPolygon,
  isFreeText,
  isStamp,
  isLink,
} from '@embedpdf/plugin-annotation';
import { PdfLinkAnnoObject } from '@embedpdf/models';
import { PointerEventHandlers, EmbedPdfPointerEvent } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { useSelectionCapability } from '@embedpdf/plugin-selection/@framework';
import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  MouseEvent,
  Fragment,
  TouchEvent,
} from '@framework';

import { useAnnotationCapability } from '../hooks';
import { AnnotationContainer } from './annotation-container';
import { GroupSelectionBox } from './group-selection-box';
import { Highlight } from './text-markup/highlight';
import { Underline } from './text-markup/underline';
import { Strikeout } from './text-markup/strikeout';
import { Squiggly } from './text-markup/squiggly';
import { Ink } from './annotations/ink';
import { Square } from './annotations/square';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  VertexHandleUI,
} from './types';
import { Circle } from './annotations/circle';
import { Line } from './annotations/line';
import { Polyline } from './annotations/polyline';
import { Polygon } from './annotations/polygon';
import { FreeText } from './annotations/free-text';
import { Stamp } from './annotations/stamp';
import { Link } from './annotations/link';

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
  selectionOutlineColor?: string;
  customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
}

export function Annotations(annotationsProps: AnnotationsProps) {
  const { documentId, pageIndex, scale, pageWidth, pageHeight, selectionMenu } = annotationsProps;
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: selectionProvides } = useSelectionCapability();
  const [annotations, setAnnotations] = useState<TrackedAnnotation[]>([]);
  const { register } = usePointerHandlers({ documentId, pageIndex });
  const [allSelectedIds, setAllSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Get scoped API for this document (memoized to prevent infinite loops)
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  // Check if multiple annotations are selected
  const isMultiSelected = allSelectedIds.length > 1;

  useEffect(() => {
    if (annotationProvides) {
      // Initialize with current state immediately
      const currentState = annotationProvides.getState();
      setAnnotations(getAnnotationsByPageIndex(currentState, pageIndex));
      setAllSelectedIds(getSelectedAnnotationIds(currentState));

      // Then subscribe to changes
      return annotationProvides.onStateChange((state) => {
        setAnnotations(getAnnotationsByPageIndex(state, pageIndex));
        setAllSelectedIds(getSelectedAnnotationIds(state));
      });
    }
  }, [annotationProvides, pageIndex]);

  const handlers = useMemo(
    (): PointerEventHandlers<EmbedPdfPointerEvent<MouseEvent>> => ({
      onPointerDown: (_, pe) => {
        // Only deselect if clicking directly on the layer (not on an annotation)
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

        // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
        const isModifierPressed = 'metaKey' in e ? e.metaKey || e.ctrlKey : false;

        if (isModifierPressed) {
          // Toggle selection: add or remove from current selection
          annotationProvides.toggleSelection(pageIndex, annotation.object.id);
        } else {
          // Exclusive select: clear and select only this one
          annotationProvides.selectAnnotation(pageIndex, annotation.object.id);
        }

        if (annotation.object.id !== editingId) {
          setEditingId(null);
        }
      }
    },
    [annotationProvides, selectionProvides, editingId, pageIndex],
  );

  // Special handler for link annotations - if IRT exists, select the parent
  const handleLinkClick = useCallback(
    (e: MouseEvent | TouchEvent, annotation: TrackedAnnotation<PdfLinkAnnoObject>) => {
      e.stopPropagation();
      if (!annotationProvides || !selectionProvides) return;

      selectionProvides.clear();

      // If link has IRT, select the parent annotation instead
      if (annotation.object.inReplyToId) {
        const parentId = annotation.object.inReplyToId;
        const parent = annotations.find((a) => a.object.id === parentId);
        if (parent) {
          annotationProvides.selectAnnotation(parent.object.pageIndex, parentId);
          return;
        }
      }

      // Standalone link - select it directly
      annotationProvides.selectAnnotation(pageIndex, annotation.object.id);
    },
    [annotationProvides, selectionProvides, annotations, pageIndex],
  );

  useEffect(() => {
    return register(handlers, {
      documentId,
    });
  }, [register, handlers]);
  // Get selected annotations that are on THIS page (for group selection box)
  const selectedAnnotationsOnPage = useMemo(() => {
    return annotations.filter((anno) => allSelectedIds.includes(anno.object.id));
  }, [annotations, allSelectedIds]);

  // Check if all selected annotations on this page are draggable in group context
  const areAllSelectedDraggable = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      // Use group-specific property, falling back to single-annotation property
      return tool?.interaction.isGroupDraggable ?? tool?.interaction.isDraggable ?? true;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  // Check if all selected annotations on this page are resizable in group context
  const areAllSelectedResizable = useMemo(() => {
    if (selectedAnnotationsOnPage.length < 2) return false;

    return selectedAnnotationsOnPage.every((ta) => {
      const tool = annotationProvides?.findToolForAnnotation(ta.object);
      // Use group-specific property, falling back to single-annotation property
      return tool?.interaction.isGroupResizable ?? tool?.interaction.isResizable ?? true;
    });
  }, [selectedAnnotationsOnPage, annotationProvides]);

  // Check if all selected annotations are on the same page (this page)
  const allSelectedOnSamePage = useMemo(() => {
    if (!annotationProvides) return false;
    const allSelected = annotationProvides.getSelectedAnnotations();
    // All selected must be on this page
    return allSelected.length > 1 && allSelected.every((ta) => ta.object.pageIndex === pageIndex);
  }, [annotationProvides, pageIndex, allSelectedIds]);

  return (
    <>
      {annotations.map((annotation) => {
        const isSelected = allSelectedIds.includes(annotation.object.id);
        const isEditing = editingId === annotation.object.id;
        const tool = annotationProvides?.findToolForAnnotation(annotation.object);

        if (isInk(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? true}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Ink
                  {...obj}
                  isSelected={isSelected}
                  scale={scale}
                  onClick={(e) => handleClick(e, annotation)}
                />
              )}
            </AnnotationContainer>
          );
        }

        if (isSquare(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? true}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Square
                  {...obj}
                  isSelected={isSelected}
                  scale={scale}
                  onClick={(e) => handleClick(e, annotation)}
                />
              )}
            </AnnotationContainer>
          );
        }

        if (isCircle(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? true}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Circle
                  {...obj}
                  isSelected={isSelected}
                  scale={scale}
                  onClick={(e) => handleClick(e, annotation)}
                />
              )}
            </AnnotationContainer>
          );
        }

        if (isUnderline(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? false}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              zIndex={0}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Underline {...obj} scale={scale} onClick={(e) => handleClick(e, annotation)} />
              )}
            </AnnotationContainer>
          );
        }

        if (isStrikeout(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? false}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              zIndex={0}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Strikeout {...obj} scale={scale} onClick={(e) => handleClick(e, annotation)} />
              )}
            </AnnotationContainer>
          );
        }

        if (isSquiggly(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? false}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              zIndex={0}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Squiggly {...obj} scale={scale} onClick={(e) => handleClick(e, annotation)} />
              )}
            </AnnotationContainer>
          );
        }

        if (isHighlight(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? false}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              zIndex={0}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Multiply),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Highlight {...obj} scale={scale} onClick={(e) => handleClick(e, annotation)} />
              )}
            </AnnotationContainer>
          );
        }

        if (isLine(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              vertexConfig={{
                extractVertices: (annotation) => [
                  annotation.linePoints.start,
                  annotation.linePoints.end,
                ],
                transformAnnotation: (annotation, vertices) => {
                  return {
                    ...annotation,
                    linePoints: {
                      start: vertices[0],
                      end: vertices[1],
                    },
                  };
                },
              }}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Fragment>
                  <Line
                    {...obj}
                    isSelected={isSelected}
                    scale={scale}
                    onClick={(e) => handleClick(e, annotation)}
                  />
                </Fragment>
              )}
            </AnnotationContainer>
          );
        }

        if (isPolyline(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              vertexConfig={{
                extractVertices: (annotation) => annotation.vertices,
                transformAnnotation: (annotation, vertices) => {
                  return {
                    ...annotation,
                    vertices,
                  };
                },
              }}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Fragment>
                  <Polyline
                    {...obj}
                    isSelected={isSelected}
                    scale={scale}
                    onClick={(e) => handleClick(e, annotation)}
                  />
                </Fragment>
              )}
            </AnnotationContainer>
          );
        }

        if (isPolygon(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? false}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              vertexConfig={{
                extractVertices: (annotation) => annotation.vertices,
                transformAnnotation: (annotation, vertices) => {
                  return {
                    ...annotation,
                    vertices,
                  };
                },
              }}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(obj) => (
                <Fragment>
                  <Polygon
                    {...obj}
                    isSelected={isSelected}
                    scale={scale}
                    onClick={(e) => handleClick(e, annotation)}
                  />
                </Fragment>
              )}
            </AnnotationContainer>
          );
        }

        if (isFreeText(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={(tool?.interaction.isDraggable ?? true) && !isEditing}
              isResizable={tool?.interaction.isResizable ?? true}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingId(annotation.object.id);
              }}
              {...annotationsProps}
            >
              {(object) => (
                <FreeText
                  isSelected={isSelected}
                  isEditing={isEditing}
                  annotation={{
                    ...annotation,
                    object,
                  }}
                  pageIndex={pageIndex}
                  scale={scale}
                  onClick={(e) => handleClick(e, annotation)}
                />
              )}
            </AnnotationContainer>
          );
        }

        if (isStamp(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={tool?.interaction.isDraggable ?? true}
              isResizable={tool?.interaction.isResizable ?? true}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              {...annotationsProps}
            >
              {(_object) => (
                <Stamp
                  isSelected={isSelected}
                  annotation={annotation}
                  documentId={documentId}
                  pageIndex={pageIndex}
                  scale={scale}
                  onClick={(e) => handleClick(e, annotation)}
                />
              )}
            </AnnotationContainer>
          );
        }

        if (isLink(annotation)) {
          // IRT-linked links are not independently draggable/resizable
          const hasIRT = !!annotation.object.inReplyToId;
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isMultiSelected={isMultiSelected}
              isDraggable={false}
              isResizable={false}
              lockAspectRatio={false}
              selectionMenu={hasIRT ? undefined : selectionMenu}
              onSelect={(e) => handleLinkClick(e, annotation)}
              {...annotationsProps}
            >
              {(obj) => (
                <Link
                  {...obj}
                  isSelected={isSelected}
                  scale={scale}
                  onClick={(e) => handleLinkClick(e, annotation)}
                  hasIRT={hasIRT}
                />
              )}
            </AnnotationContainer>
          );
        }

        /* --------- fallback: an unsupported subtype --------------- */
        return null;
      })}

      {/* Group selection box for multi-select drag/resize */}
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
          resizeUI={annotationsProps.resizeUI}
          selectionOutlineColor={annotationsProps.selectionOutlineColor}
          groupSelectionMenu={annotationsProps.groupSelectionMenu}
        />
      )}
    </>
  );
}
