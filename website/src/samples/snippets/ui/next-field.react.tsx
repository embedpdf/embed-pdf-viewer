import { Anchored } from '@embedpdf/react/anchored';
import { useForm, useFormState, useFormWidgetAnchor } from '@embedpdf/react/form';

/** A tag beside the next required field that is still empty. */
export function NextField() {
  const form = useForm();
  useFormState((state) => state.fields); // again when a field is filled in
  const next = form.validate().missing[0];
  const anchor = useFormWidgetAnchor(next ? (form.getWidgets(next.ref)[0]?.ref ?? null) : null);

  if (!next) return null;
  return (
    <Anchored anchor={anchor} placement="left" gap={6} pinned>
      <button className="next-field" onClick={() => form.focus(next.ref)}>
        {next.kind === 'signature' ? 'Sign' : 'Fill in'}
      </button>
    </Anchored>
  );
}
