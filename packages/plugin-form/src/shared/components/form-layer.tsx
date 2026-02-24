import { useCallback, useEffect, useMemo, useState } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';

import { FormFieldValue, ignore, PdfWidgetAnnoObject } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/@framework';

import { useFormCapability } from '../hooks/use-form';
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

  const onChangeValues = useCallback(
    (annotation: PdfWidgetAnnoObject, values: FormFieldValue[]) => {
      if (!scope) return;
      const task = scope.setFormFieldValues(pageIndex, annotation, values);
      task.wait(ignore, ignore);
    },
    [scope, pageIndex],
  );

  return (
    <div style={style} {...props}>
      {annoWidgets.map((annoWidget) => (
        <Field
          key={annoWidget.id}
          scale={actualScale}
          pageIndex={pageIndex}
          annotation={annoWidget}
          field={annoWidget.field}
          isEditable={true}
          values={[]}
          onChangeValues={(values) => onChangeValues(annoWidget, values)}
        />
      ))}
    </div>
  );
}
