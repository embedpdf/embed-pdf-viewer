import { useEffect } from 'react';
import { useForm } from '@embedpdf/react/form';

/** Render it where the document shows: it fills in what the app knows when the person starts. */
export function Prefill() {
  const form = useForm();

  useEffect(() => {
    // A field that has a value is left alone, so a second call writes nothing.
    void form.prefill();
  }, [form]);

  return null;
}
