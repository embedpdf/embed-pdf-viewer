<script lang="ts">
  import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
  import type { TextFieldProps } from '../../../shared/components/types';
  import { useIOSZoomPrevention } from '@embedpdf/plugin-annotation/svelte';

  let {
    annotation,
    scale,
    isEditable,
    onChangeField,
    onFocus,
    onBlur,
    inputRef,
    syncExternalValue = true,
  }: TextFieldProps = $props();

  const field = $derived(annotation.field);
  const flag = $derived(field.flag);
  const name = $derived(field.name);
  const value = $derived(field.value);

  let localValue = $state(value);

  $effect(() => {
    if (!syncExternalValue) return;
    localValue = value;
  });

  function changeValue(evt: Event) {
    const newValue = (evt.target as HTMLInputElement).value;
    localValue = newValue;
    onChangeField?.({ ...field, value: newValue });
  }

  const bw = $derived((annotation.strokeWidth ?? 0) * scale);
  const fontCss = $derived(standardFontCssProperties(annotation.fontFamily));
  const computedFontPx = $derived(annotation.fontSize * scale);

  const ios = useIOSZoomPrevention(
    () => computedFontPx,
    () => true,
  );

  const isDisabled = $derived(!isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY));
  const isRequired = $derived(!!(flag & PDF_FORM_FIELD_FLAG.REQUIRED));
  const isPassword = $derived(!!(flag & PDF_FORM_FIELD_FLAG.TEXT_PASSWORD));
  const isMultipleLine = $derived(!!(flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE));
  const isComb = $derived(!!(flag & PDF_FORM_FIELD_FLAG.TEXT_COMB));
  const maxLen = $derived(field.maxLen);

  const cellWidth = $derived(isComb && maxLen ? (annotation.rect.size.width * scale) / maxLen : 0);
  const chars = $derived((localValue || '').split(''));
  const caretIndex = $derived(chars.length);

  let caretVisible = $state(true);
  let caretInterval: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    const _ci = caretIndex;
    caretVisible = true;
    clearInterval(caretInterval);
    caretInterval = setInterval(() => {
      caretVisible = !caretVisible;
    }, 530);
    return () => clearInterval(caretInterval);
  });

  function refAction(node: HTMLElement) {
    inputRef?.(node);
    return { destroy: () => inputRef?.(null) };
  }
</script>

{#snippet combContent()}
  <div
    style:position="relative"
    style:width="100%"
    style:height="100%"
    style:border-radius="0"
    style:box-sizing="border-box"
    style:border-style="solid"
    style:background-color={annotation.color ?? 'transparent'}
    style:border-color={annotation.strokeColor ?? 'transparent'}
    style:border-width="{bw}px"
  >
    <input
      use:refAction
      required={isRequired}
      disabled={isDisabled}
      type={isPassword ? 'password' : 'text'}
      {name}
      aria-label={name}
      value={localValue}
      maxlength={maxLen}
      onfocus={onFocus}
      oninput={changeValue}
      onblur={onBlur}
      style:position="absolute"
      style:top="0"
      style:left="0"
      style:width="100%"
      style:height="100%"
      style:opacity="0"
      style:padding="0"
      style:margin="0"
      style:border="none"
      style:z-index="1"
    />
    {#each Array.from({ length: maxLen }) as _, i}
      <span
        style:position="absolute"
        style:top="0"
        style:height="100%"
        style:display="flex"
        style:align-items="center"
        style:justify-content="center"
        style:pointer-events="none"
        style:left="{i * cellWidth}px"
        style:width="{cellWidth}px"
        style:color={annotation.fontColor}
        style:font-family={fontCss.fontFamily}
        style:font-weight={fontCss.fontWeight}
        style:font-style={fontCss.fontStyle}
        style:font-size="{ios.adjustedFontPx}px">{chars[i] || ''}</span
      >
    {/each}
    {#if caretIndex < maxLen}
      <span
        style:position="absolute"
        style:top="15%"
        style:height="70%"
        style:width="1px"
        style:background-color="black"
        style:pointer-events="none"
        style:left="{caretIndex * cellWidth + cellWidth / 2}px"
        style:opacity={caretVisible ? 1 : 0}
      ></span>
    {/if}
  </div>
{/snippet}

{#snippet textareaContent()}
  <textarea
    use:refAction
    required={isRequired}
    disabled={isDisabled}
    {name}
    aria-label={name}
    value={localValue}
    maxlength={maxLen}
    onfocus={onFocus}
    oninput={changeValue}
    onblur={onBlur}
    style:background-color={annotation.color ?? 'transparent'}
    style:border-color={annotation.strokeColor ?? 'transparent'}
    style:border-width="{bw}px"
    style:color={annotation.fontColor}
    style:font-family={fontCss.fontFamily}
    style:font-weight={fontCss.fontWeight}
    style:font-style={fontCss.fontStyle}
    style:font-size="{ios.adjustedFontPx}px"
    style:padding="{bw}px"
    style:position="absolute"
    style:top="0"
    style:left="0"
    style:width="100%"
    style:height="100%"
    style:margin="0"
    style:border-radius="0"
    style:outline="none"
    style:box-sizing="border-box"
    style:border-style="solid"
    style:resize="none"
    style:line-height="1.14"
  ></textarea>
{/snippet}

{#snippet inputContent()}
  <input
    use:refAction
    required={isRequired}
    disabled={isDisabled}
    type={isPassword ? 'password' : 'text'}
    {name}
    aria-label={name}
    value={localValue}
    maxlength={maxLen}
    onfocus={onFocus}
    oninput={changeValue}
    onblur={onBlur}
    style:background-color={annotation.color ?? 'transparent'}
    style:border-color={annotation.strokeColor ?? 'transparent'}
    style:border-width="{bw}px"
    style:color={annotation.fontColor}
    style:font-family={fontCss.fontFamily}
    style:font-weight={fontCss.fontWeight}
    style:font-style={fontCss.fontStyle}
    style:font-size="{ios.adjustedFontPx}px"
    style:padding="{bw}px"
    style:position="absolute"
    style:top="0"
    style:left="0"
    style:width="100%"
    style:height="100%"
    style:margin="0"
    style:border-radius="0"
    style:outline="none"
    style:box-sizing="border-box"
    style:border-style="solid"
  />
{/snippet}

{#if isComb && maxLen}
  {#if ios.wrapperStyle}
    <div style={ios.wrapperStyle}>
      {@render combContent()}
    </div>
  {:else}
    {@render combContent()}
  {/if}
{:else if isMultipleLine}
  {#if ios.wrapperStyle}
    <div style={ios.wrapperStyle}>
      {@render textareaContent()}
    </div>
  {:else}
    {@render textareaContent()}
  {/if}
{:else if ios.wrapperStyle}
  <div style={ios.wrapperStyle}>
    {@render inputContent()}
  </div>
{:else}
  {@render inputContent()}
{/if}
