import { HTMLAttributes, CSSProperties, useMemo } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Annotations } from './annotations';
import { TextMarkup } from './text-markup';
import {
  ResizeHandleUI,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
  CustomAnnotationRenderer,
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
  BoxedAnnotationRenderer,
} from './types';
import { AnnotationPaintLayer } from './annotation-paint-layer';
import { PdfAnnotationObject, Rotation } from '@embedpdf/models';
import { useRegisteredRenderers } from '../context/renderer-registry';

type AnnotationLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  /** The ID of the document that this layer displays annotations for */
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
  /** Customize selection menu across all annotations on this layer */
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  /** Customize group selection menu across all annotations on this layer */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  style?: CSSProperties;
  /** Customize resize handles */
  resizeUI?: ResizeHandleUI;
  /** Customize vertex handles */
  vertexUI?: VertexHandleUI;
  /** Customize rotation handle */
  rotationUI?: RotationHandleUI;
  /** @deprecated Use `selectionOutline` instead */
  selectionOutlineColor?: string;
  /** Customize the selection outline for individual annotations */
  selectionOutline?: SelectionOutline;
  /** Customize the selection outline for the group selection box (falls back to selectionOutline) */
  groupSelectionOutline?: SelectionOutline;
  /** Customize annotation renderer */
  customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
  /** Custom renderers for specific annotation types (provided by external plugins) */
  annotationRenderers?: BoxedAnnotationRenderer[];
};

export function AnnotationLayer({
  style,
  documentId,
  pageIndex,
  scale: overrideScale,
  rotation: overrideRotation,
  selectionMenu,
  groupSelectionMenu,
  resizeUI,
  vertexUI,
  rotationUI,
  selectionOutlineColor,
  selectionOutline,
  groupSelectionOutline,
  customAnnotationRenderer,
  annotationRenderers,
  ...props
}: AnnotationLayerProps) {
  const documentState = useDocumentState(documentId);
  const page = documentState?.document?.pages?.[pageIndex];
  const width = page?.size?.width ?? 0;
  const height = page?.size?.height ?? 0;

  // Auto-load renderers from context
  const contextRenderers = useRegisteredRenderers();

  // Merge: context + explicit props (props take precedence by id)
  const allRenderers = useMemo(() => {
    const merged = [...contextRenderers];
    for (const renderer of annotationRenderers ?? []) {
      const idx = merged.findIndex((r) => r.id === renderer.id);
      if (idx >= 0) merged[idx] = renderer;
      else merged.push(renderer);
    }
    return merged;
  }, [contextRenderers, annotationRenderers]);

  const actualScale = useMemo(() => {
    if (overrideScale !== undefined) return overrideScale;
    return documentState?.scale ?? 1;
  }, [overrideScale, documentState?.scale]);

  const actualRotation = useMemo(() => {
    if (overrideRotation !== undefined) return overrideRotation;
    // Combine page intrinsic rotation with document rotation
    const pageRotation = page?.rotation ?? 0;
    const docRotation = documentState?.rotation ?? 0;
    return ((pageRotation + docRotation) % 4) as Rotation;
  }, [overrideRotation, page?.rotation, documentState?.rotation]);

  return (
    <div
      style={{
        ...style,
      }}
      {...props}
    >
      <Annotations
        documentId={documentId}
        selectionMenu={selectionMenu}
        groupSelectionMenu={groupSelectionMenu}
        pageIndex={pageIndex}
        scale={actualScale}
        rotation={actualRotation}
        pageWidth={width}
        pageHeight={height}
        resizeUI={resizeUI}
        vertexUI={vertexUI}
        rotationUI={rotationUI}
        selectionOutlineColor={selectionOutlineColor}
        selectionOutline={selectionOutline}
        groupSelectionOutline={groupSelectionOutline}
        customAnnotationRenderer={customAnnotationRenderer}
        annotationRenderers={allRenderers}
      />
      <TextMarkup documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
      <AnnotationPaintLayer documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
    </div>
  );
}
