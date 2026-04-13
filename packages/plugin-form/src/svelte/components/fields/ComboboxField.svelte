<script lang="ts">
  import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
  import type { ComboboxFieldProps } from '../../../shared/components/types';

  let { annotation, isEditable, onChangeField, onFocus, onBlur, inputRef }: ComboboxFieldProps =
    $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const options = $derived(field.options);
  const name = $derived(field.alternateName || field.name);
  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
  const isRequired = $derived(!!(flag & PDF_FORM_FIELD_FLAG.REQUIRED));
  const selectedValue = $derived(options.find((o) => o.isSelected)?.label ?? '');

  function handleChange(evt: Event) {
    const select = evt.target as HTMLSelectElement;
    const updatedOptions = options.map((opt, i) => ({
      ...opt,
      isSelected: i === select.selectedIndex,
    }));
    onChangeField?.({ ...field, options: updatedOptions });
  }

  function refAction(node: HTMLElement) {
    inputRef?.(node);
    return { destroy: () => inputRef?.(null) };
  }
</script>

<select
  use:refAction
  required={isRequired}
  disabled={isDisabled}
  value={selectedValue}
  {name}
  aria-label={name}
  onfocus={onFocus}
  onchange={handleChange}
  onblur={onBlur}
  style:position="absolute"
  style:inset="0"
  style:display="block"
  style:z-index="1"
  style:width="100%"
  style:height="100%"
  style:min-width="100%"
  style:min-height="100%"
  style:padding="0"
  style:margin="0"
  style:border="0"
  style:border-radius="0"
  style:background="transparent"
  style:outline="none"
  style:box-sizing="border-box"
  style:appearance="none"
  style:-webkit-appearance="none"
  style:pointer-events="auto"
  style:cursor="inherit"
  style:opacity="0"
>
  {#each options as option}
    <option value={option.label}>
      {option.label}
    </option>
  {/each}
</select>
