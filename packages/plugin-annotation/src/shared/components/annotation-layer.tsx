import { HTMLAttributes, CSSProperties } from '@framework';
import { Annotations } from './annotations';
import { TextMarkup } from './text-markup';
import { SelectionMenu, ResizeHandleUI, VertexHandleUI, CustomAnnotationRenderer } from '../types';
import { AnnotationPaintLayer } from './annotation-paint-layer';
import { PdfAnnotationObject } from '@embedpdf/models';

type AnnotationLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  /** Customize selection menu across all annotations on this layer */
  selectionMenu?: SelectionMenu;
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
  pageIndex,
  scale,
  selectionMenu,
  resizeUI,
  vertexUI,
  pageWidth,
  pageHeight,
  rotation,
  selectionOutlineColor,
  customAnnotationRenderer,
  ...props
}: AnnotationLayerProps) {
  return (
    <div
      style={{
        ...style,
      }}
      {...props}
    >
      <Annotations
        selectionMenu={selectionMenu}
        pageIndex={pageIndex}
        scale={scale}
        rotation={rotation}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        resizeUI={resizeUI}
        vertexUI={vertexUI}
        selectionOutlineColor={selectionOutlineColor}
        customAnnotationRenderer={customAnnotationRenderer}
      />
      <TextMarkup pageIndex={pageIndex} scale={scale} />
      <AnnotationPaintLayer pageIndex={pageIndex} scale={scale} />
    </div>
  );
}
