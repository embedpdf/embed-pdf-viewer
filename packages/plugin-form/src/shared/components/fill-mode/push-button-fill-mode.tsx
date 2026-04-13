import { PdfWidgetAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '@embedpdf/plugin-annotation/@framework';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { RenderWidget } from '../render-widget';

export function PushButtonFillMode(props: AnnotationRendererProps<PdfWidgetAnnoObject>) {
  const { annotation, scale, pageIndex, renderKey } = useFormWidgetState(props);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <RenderWidget
        pageIndex={pageIndex}
        annotation={annotation}
        scaleFactor={scale}
        renderKey={renderKey}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}
