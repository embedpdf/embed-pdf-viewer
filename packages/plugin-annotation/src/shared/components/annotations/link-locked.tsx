import { useCallback } from '@framework';
import { PdfLinkAnnoObject } from '@embedpdf/models';
import { AnnotationRendererProps } from '../types';
import { useAnnotationCapability } from '../../hooks/use-annotation';

export function LinkLockedMode({
  annotation,
  documentId,
}: AnnotationRendererProps<PdfLinkAnnoObject>) {
  const { provides } = useAnnotationCapability();

  const handleClick = useCallback(() => {
    const target = annotation.object.target;
    if (!target || !provides) return;

    provides.forDocument(documentId).navigateTarget(target);
  }, [annotation.object.target, provides, documentId]);

  return (
    <div
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    />
  );
}
