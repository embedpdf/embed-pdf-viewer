<script lang="ts">
  import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
  import type { ListboxFieldProps } from '../../../shared/components/types';

  let { annotation, scale, isEditable, onChangeField, onBlur, inputRef }: ListboxFieldProps =
    $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const options = $derived(field.options);
  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
  const isMultipleChoice = $derived(!!(flag & PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT));

  const bw = $derived((annotation.strokeWidth ?? 0) * scale);
  const fontSize = $derived((annotation.fontSize ?? 12) * scale);
  const lineHeight = $derived(fontSize * 1.2);
  const fontCss = $derived(standardFontCssProperties(annotation.fontFamily));

  function handleOptionClick(clickedIndex: number) {
    if (isDisabled) return;
    const updatedOptions = options.map((opt, i) => ({
      ...opt,
      isSelected: isMultipleChoice
        ? i === clickedIndex
          ? !opt.isSelected
          : opt.isSelected
        : i === clickedIndex,
    }));
    onChangeField?.({ ...field, options: updatedOptions });
  }

  function refAction(node: HTMLElement) {
    inputRef?.(node);
    return { destroy: () => inputRef?.(null) };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  use:refAction
  onblur={onBlur}
  style:position="absolute"
  style:top="0"
  style:left="0"
  style:width="100%"
  style:height="100%"
  style:background={annotation.color ?? '#FFFFFF'}
  style:border-style="solid"
  style:border-color={annotation.strokeColor ?? '#000000'}
  style:border-width="{bw}px"
  style:box-sizing="border-box"
  style:overflow="auto"
  style:display="flex"
  style:flex-direction="column"
  style:outline="none"
>
  {#each options as opt, i}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="option"
      aria-selected={opt.isSelected}
      onclick={() => handleOptionClick(i)}
      style:padding="0 {4 * scale}px"
      style:font-size="{fontSize}px"
      style:line-height="{lineHeight}px"
      style:font-family={fontCss.fontFamily}
      style:font-weight={fontCss.fontWeight}
      style:font-style={fontCss.fontStyle}
      style:color={opt.isSelected ? '#FFFFFF' : (annotation.fontColor ?? '#000000')}
      style:background={opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent'}
      style:white-space="nowrap"
      style:overflow="hidden"
      style:text-overflow="ellipsis"
      style:cursor={isDisabled ? 'default' : 'pointer'}
    >
      {opt.label}
    </div>
  {/each}
</div>
