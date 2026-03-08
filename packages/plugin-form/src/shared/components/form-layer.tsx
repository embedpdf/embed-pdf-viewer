import { useCallback, useEffect, useMemo, useState } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';

import { ignore, PdfWidgetAnnoObject, PdfWidgetAnnoField } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/@framework';

import { useFormCapability, useFormDocumentState } from '../hooks/use-form';
import { Field } from './field';

type FormLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  /**
   * The scale factor for rendering the page.
   */
  scale?: number;
  style?: CSSProperties;
};

export function FormLayer({
  documentId,
  pageIndex,
  scale: overrideScale,
  style,
  ...props
}: FormLayerProps) {
  const { provides: formProvides } = useFormCapability();
  const documentState = useDocumentState(documentId);
  const formDocState = useFormDocumentState(documentId);

  const actualScale = useMemo(() => {
    if (overrideScale !== undefined) return overrideScale;
    return documentState?.scale ?? 1;
  }, [overrideScale, documentState?.scale]);

  const scope = useMemo(() => formProvides?.forDocument(documentId), [formProvides, documentId]);

  const [annoWidgets, setAnnoWidgets] = useState<PdfWidgetAnnoObject[]>([]);

  useEffect(() => {
    if (!scope) return;
    const task = scope.getPageFormAnnoWidgets(pageIndex);
    task.wait(setAnnoWidgets, ignore);
  }, [scope, pageIndex]);

  const onChangeField = useCallback(
    (annotation: PdfWidgetAnnoObject, newField: PdfWidgetAnnoField) => {
      if (!scope) return;
      scope.setFormFieldValues(pageIndex, annotation, newField).wait(ignore, ignore);
    },
    [scope, pageIndex],
  );

  return (
    <div style={style} {...props}>
      {annoWidgets.map((annoWidget) => {
        // Use the latest widget snapshot from plugin state if available,
        // falling back to the originally-loaded widget.
        const currentWidget = formDocState.fieldWidgets[annoWidget.id] ?? annoWidget;
        return (
          <Field
            key={annoWidget.id}
            scale={actualScale}
            pageIndex={pageIndex}
            annotation={currentWidget}
            isEditable={true}
            onChangeField={(newField) => onChangeField(annoWidget, newField)}
          />
        );
      })}
    </div>
  );
}
