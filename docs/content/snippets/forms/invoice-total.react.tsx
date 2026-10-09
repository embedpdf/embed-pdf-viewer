import { toFieldRef, useFormValue } from '@embedpdf/react/form';

export function InvoiceTotal() {
  const total = useFormValue(toFieldRef('invoice.total'));

  return <output>{total && 'value' in total && total.value}</output>;
}
