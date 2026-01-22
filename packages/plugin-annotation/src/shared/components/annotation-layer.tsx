import { HTMLAttributes, CSSProperties, useMemo } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Annotations } from './annotations';
import { TextMarkup } from './text-markup';
import {
  ResizeHandleUI,
  VertexHandleUI,
  CustomAnnotationRenderer,
  AnnotationSelectionMenuRenderFn,
  GroupSelectionMenuRenderFn,
} from './types';
import { AnnotationPaintLayer } from './annotation-paint-layer';
import { PdfAnnotationObject, Rotation } from '@embedpdf/models';

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
  /** Customize selection outline color */
  selectionOutlineColor?: string;
  /** Customize annotation renderer */
  customAnnotationRenderer?: CustomAnnotationRenderer<PdfAnnotationObject>;
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
  selectionOutlineColor,
  customAnnotationRenderer,
  ...props
}: AnnotationLayerProps) {
  const documentState = useDocumentState(documentId);
  const page = documentState?.document?.pages?.[pageIndex];
  const width = page?.size?.width ?? 0;
  const height = page?.size?.height ?? 0;

  const actualScale = useMemo(() => {
    if (overrideScale !== undefined) return overrideScale;
    return documentState?.scale ?? 1;
  }, [overrideScale, documentState?.scale]);

  const actualRotation = useMemo(() => {
    if (overrideRotation !== undefined) return overrideRotation;
    return documentState?.rotation ?? Rotation.Degree0;
  }, [overrideRotation, documentState?.rotation]);

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
        selectionOutlineColor={selectionOutlineColor}
        customAnnotationRenderer={customAnnotationRenderer}
      />
      <TextMarkup documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
      <AnnotationPaintLayer documentId={documentId} pageIndex={pageIndex} scale={actualScale} />
    </div>
  );
}
