<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import type { PdfWidgetAnnoObject, PdfTextWidgetAnnoField } from '@embedpdf/models';
  import {
    PDF_FORM_FIELD_TYPE,
    PDF_FORM_FIELD_FLAG,
    standardFontCssProperties,
  } from '@embedpdf/models';

  let {
    annotation,
    currentObject,
    isSelected,
    scale,
    pageIndex,
    onClick,
  }: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();

  let isHovered = $state(false);

  const object = $derived(currentObject);
  const field = $derived(object.field);
  const isTextField = $derived(field.type === PDF_FORM_FIELD_TYPE.TEXTFIELD);
  const value = $derived(isTextField ? (field as PdfTextWidgetAnnoField).value : '');
  const isComb = $derived(
    isTextField &&
      !!(field.flag & PDF_FORM_FIELD_FLAG.TEXT_COMB) &&
      !!(field as PdfTextWidgetAnnoField).maxLen,
  );
  const isMultiline = $derived(isTextField && !!(field.flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE));
  const maxLen = $derived(isTextField ? (field as PdfTextWidgetAnnoField).maxLen : undefined);
  const borderWidth = $derived((object.strokeWidth ?? 1) * scale);
  const fontCss = $derived(standardFontCssProperties(object.fontFamily));
  const fontSize = $derived((object.fontSize ?? 12) * scale);
  const fontColor = $derived(object.fontColor ?? '#000000');

  const cellWidth = $derived(isComb && maxLen ? (object.rect.size.width * scale) / maxLen : 0);
  const chars = $derived((value ?? '').split(''));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={(e) => {
    if (!isSelected) onClick?.(e);
  }}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  style:position="absolute"
  style:inset="0"
  style:background={object.color ?? 'rgba(255, 255, 255, 0.9)'}
  style:border="{borderWidth}px solid {object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}"
  style:outline={isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none'}
  style:outline-offset="-1px"
  style:box-sizing="border-box"
  style:pointer-events="auto"
  style:cursor={isSelected ? 'move' : 'pointer'}
  style:display="flex"
  style:align-items={isMultiline ? 'flex-start' : 'center'}
  style:overflow="hidden"
  style:padding={!isComb ? `${borderWidth}px ${borderWidth}px` : undefined}
>
  {#if isComb && maxLen}
    <div style="position: relative; width: 100%; height: 100%;">
      {#each Array.from({ length: maxLen }) as _, i}
        <span
          style:position="absolute"
          style:top="0"
          style:left="{i * cellWidth}px"
          style:width="{cellWidth}px"
          style:height="100%"
          style:display="flex"
          style:align-items="center"
          style:justify-content="center"
          style:border-right={i < maxLen - 1
            ? `1px solid ${object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}`
            : 'none'}
          style:box-sizing="border-box"
          style:font-size="{fontSize}px"
          style:font-family={fontCss.fontFamily}
          style:font-weight={fontCss.fontWeight}
          style:font-style={fontCss.fontStyle}
          style:color={fontColor}
          style:line-height="1.2">{chars[i] || ''}</span
        >
      {/each}
    </div>
  {:else}
    <span
      style:font-size="{fontSize}px"
      style:font-family={fontCss.fontFamily}
      style:font-weight={fontCss.fontWeight}
      style:font-style={fontCss.fontStyle}
      style:color={fontColor}
      style:line-height="1.2"
      style:display="block"
      style:width="100%"
      style:white-space={isMultiline ? 'pre-wrap' : 'nowrap'}
      style:word-break={isMultiline ? 'break-word' : 'normal'}
      style:overflow-wrap={isMultiline ? 'break-word' : 'normal'}
      style:overflow="hidden"
      style:text-overflow={isMultiline ? 'clip' : 'ellipsis'}>{value}</span
    >
  {/if}
</div>
