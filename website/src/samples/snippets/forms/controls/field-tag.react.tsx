import { Anchored } from '@embedpdf/react/anchored';
import { useForm, useFormWidgetAnchor, type FormField } from '@embedpdf/react/form';

/** A tag beside the first box of a field. */
export function FieldTag({ field, children }: { field: FormField; children: string }) {
  const form = useForm();
  const anchor = useFormWidgetAnchor(form.getWidgets(field.ref)[0]?.ref ?? null);

  return (
    <Anchored anchor={anchor} placement="left" gap={4} pinned>
      <span className="tag">{children}</span>
    </Anchored>
  );
}
