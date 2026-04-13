<script lang="ts">
  import { PDF_FORM_FIELD_FLAG, isWidgetChecked } from '@embedpdf/models';
  import type { PdfWidgetAnnoOption } from '@embedpdf/models';
  import type { RadioButtonFieldProps } from '../../../shared/components/types';

  let { annotation, isEditable, onChangeField }: RadioButtonFieldProps = $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const name = $derived(field.alternateName || field.name);
  const checked = $derived(isWidgetChecked(annotation));
  const defaultValue = $derived.by(() => {
    const option = field.options.find((o: PdfWidgetAnnoOption) => o.isSelected);
    return option?.label || field.value;
  });
  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
  const isRequired = $derived(!!(flag & PDF_FORM_FIELD_FLAG.REQUIRED));

  function handleChange(evt: Event) {
    const wantChecked = (evt.target as HTMLInputElement).checked;
    if (wantChecked && annotation.exportValue) {
      onChangeField?.({ ...field, value: annotation.exportValue });
    }
  }
</script>

<input
  type="radio"
  required={isRequired}
  disabled={isDisabled}
  {name}
  aria-label={name}
  value={defaultValue}
  {checked}
  onchange={handleChange}
  style:position="absolute"
  style:top="0"
  style:left="0"
  style:width="100%"
  style:height="100%"
  style:padding="0"
  style:margin="0"
/>
