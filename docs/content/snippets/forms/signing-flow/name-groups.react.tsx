import { useLayoutEffect } from 'react';
import { useForm, type FormGroupInput } from '@embedpdf/react/form';

/** Render it where the document shows, so every document you open gets its own list. */
export function Signers({ signers }: { signers: FormGroupInput[] }) {
  const form = useForm();

  // Before the first paint, so no field shows in another color first.
  useLayoutEffect(() => {
    form.setGroups(signers);
  }, [form, signers]);

  return null;
}
