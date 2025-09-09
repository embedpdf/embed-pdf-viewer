import { Fragment, useEffect, useRef, useState } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';

import { ignore, PdfErrorCode, PdfWidgetAnnoObject } from '@embedpdf/models';

import { useFormCapability, useFormPlugin } from '../hooks/use-form';
import { Field } from './field';

type FormLayerProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  pageIndex: number;
  /**
   * The scale factor for rendering the page.
   */
  scale?: number;
  style?: CSSProperties;
};

export function FormLayer({ pageIndex, scale, style, ...props }: FormLayerProps) {
  const { provides: formProvides } = useFormCapability();
  const { plugin: formPlugin } = useFormPlugin();

  const [annoWidgets, setAnnoWidgets] = useState<PdfWidgetAnnoObject[]>([]);

  useEffect(() => {
    if (!formPlugin) return;
    const task = formPlugin.getPageFormAnnoWidgets(pageIndex);
    task.wait(setAnnoWidgets, ignore);
  }, [formPlugin, pageIndex]);

  return (
    <div style={style} {...props}>
      <h1>Form Layer</h1>
      {annoWidgets.map((annoWidget) => (
        <Field
          key={annoWidget.id}
          annotation={annoWidget}
          field={annoWidget.field}
          isEditable={true}
          values={[]}
          onChangeValues={() => {}}
        />
      ))}
    </div>
  );
}
