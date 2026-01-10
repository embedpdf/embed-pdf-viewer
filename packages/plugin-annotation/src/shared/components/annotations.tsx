import { blendModeToCss, PdfAnnotationObject, PdfBlendMode } from '@embedpdf/models';
import {
  getAnnotationsByPageIndex,
  getSelectedAnnotationByPageIndex,
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
} from '@embedpdf/plugin-annotation';
import { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
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
import { useCoreState } from '@embedpdf/core/@framework';
import { AnnotationContainer } from './annotation-container';
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
  VertexHandleUI,
} from './types';
import { Circle } from './annotations/circle';
import { Line } from './annotations/line';
import { Polyline } from './annotations/polyline';
import { Polygon } from './annotations/polygon';
import { FreeText } from './annotations/free-text';
import { Stamp } from './annotations/stamp';

interface AnnotationsProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  selectionOutlineColor?: string;
  customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
}

export function Annotations(annotationsProps: AnnotationsProps) {
  const { documentId, pageIndex, scale, selectionMenu } = annotationsProps;
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: selectionProvides } = useSelectionCapability();
  const coreState = useCoreState();
  const [annotations, setAnnotations] = useState<TrackedAnnotation[]>([]);
  const { register } = usePointerHandlers({ documentId, pageIndex });
  const [selectionState, setSelectionState] = useState<TrackedAnnotation | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Check if document is read-only
  const isReadOnly = useMemo(
    () => coreState?.documents[documentId]?.readOnly === true,
    [coreState, documentId],
  );

  // Get scoped API for this document (memoized to prevent infinite loops)
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  useEffect(() => {
    if (annotationProvides) {
      // Initialize with current state immediately
      const currentState = annotationProvides.getState();
      setAnnotations(getAnnotationsByPageIndex(currentState, pageIndex));
      setSelectionState(getSelectedAnnotationByPageIndex(currentState, pageIndex));

      // Then subscribe to changes
      return annotationProvides.onStateChange((state) => {
        setAnnotations(getAnnotationsByPageIndex(state, pageIndex));
        setSelectionState(getSelectedAnnotationByPageIndex(state, pageIndex));
      });
    }
  }, [annotationProvides, pageIndex]);

  const handlers = useMemo(
    (): PointerEventHandlers<MouseEvent> => ({
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
        annotationProvides.selectAnnotation(pageIndex, annotation.object.id);
        selectionProvides.clear();
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

  return (
    <>
      {annotations.map((annotation) => {
        const isSelected = selectionState?.object.id === annotation.object.id;
        const isEditing = editingId === annotation.object.id;
        const tool = annotationProvides?.findToolForAnnotation(annotation.object);

        if (isInk(annotation)) {
          return (
            <AnnotationContainer
              key={annotation.object.id}
              trackedAnnotation={annotation}
              isSelected={isSelected}
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? false)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? false)}
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true) && !isEditing}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
              lockAspectRatio={tool?.interaction.lockAspectRatio ?? false}
              selectionMenu={selectionMenu}
              onSelect={(e) => handleClick(e, annotation)}
              style={{
                mixBlendMode: blendModeToCss(annotation.object.blendMode ?? PdfBlendMode.Normal),
              }}
              onDoubleClick={(e) => {
                if (isReadOnly) return;
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
              isDraggable={!isReadOnly && (tool?.interaction.isDraggable ?? true)}
              isResizable={!isReadOnly && (tool?.interaction.isResizable ?? true)}
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

        /* --------- fallback: an unsupported subtype --------------- */
        return null;
      })}
    </>
  );
}
