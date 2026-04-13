<script lang="ts">
  import { PDF_FORM_FIELD_FLAG, isWidgetChecked } from '@embedpdf/models';
  import type { CheckboxFieldProps } from '../../../shared/components/types';

  let { annotation, isEditable, onChangeField }: CheckboxFieldProps = $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const name = $derived(field.alternateName || field.name);
  const checked = $derived(isWidgetChecked(annotation));
  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
  const isRequired = $derived(!!(flag & PDF_FORM_FIELD_FLAG.REQUIRED));

  function handleChange(evt: Event) {
    const wantChecked = (evt.target as HTMLInputElement).checked;
    const newValue = wantChecked ? (annotation.exportValue ?? 'Yes') : 'Off';
    onChangeField?.({ ...field, value: newValue });
  }
</script>

<input
  type="checkbox"
  required={isRequired}
  disabled={isDisabled}
  {name}
  aria-label={name}
  value={field.value}
  {checked}
  onchange={handleChange}
  style:position="absolute"
  style:top="0"
  style:left="0"
  style:width="100%"
  style:height="100%"
  style:padding="0"
  style:margin="0"
  style:border-radius="0"
  style:background-color="transparent"
  style:border="none"
  style:outline="none"
/>
