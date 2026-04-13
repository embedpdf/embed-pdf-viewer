<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import { PDF_FORM_FIELD_TYPE, standardFontCssProperties } from '@embedpdf/models';

  let {
    annotation,
    currentObject,
    isSelected,
    scale,
    onClick,
  }: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();

  let isHovered = $state(false);

  const object = $derived(currentObject);
  const field = $derived(object.field);
  const options = $derived(field.type === PDF_FORM_FIELD_TYPE.COMBOBOX ? field.options : []);
  const selectedLabel = $derived(options.find((o) => o.isSelected)?.label ?? '');
  const borderWidth = $derived((object.strokeWidth ?? 1) * scale);
  const fontSize = $derived((object.fontSize ?? 12) * scale);
  const fontCss = $derived(standardFontCssProperties(object.fontFamily));
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
  style:background={object.color ?? '#FFFFFF'}
  style:border="{borderWidth}px solid {object.strokeColor ?? '#000000'}"
  style:outline={isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none'}
  style:outline-offset="-1px"
  style:box-sizing="border-box"
  style:pointer-events="auto"
  style:cursor={isSelected ? 'move' : 'pointer'}
  style:display="flex"
  style:align-items="center"
  style:overflow="hidden"
>
  <span
    style:flex="1"
    style:padding="0 {4 * scale}px"
    style:font-size="{fontSize}px"
    style:font-family={fontCss.fontFamily}
    style:font-weight={fontCss.fontWeight}
    style:font-style={fontCss.fontStyle}
    style:color={object.fontColor ?? '#000000'}
    style:white-space="nowrap"
    style:overflow="hidden"
    style:text-overflow="ellipsis">{selectedLabel}</span
  >
  <div
    style:width="{13 * scale}px"
    style:min-width="{13 * scale}px"
    style:height="100%"
    style:display="flex"
    style:align-items="center"
    style:justify-content="center"
    style:border-left="1px solid {object.strokeColor ?? '#000000'}"
  >
    <svg
      viewBox="0 0 10 6"
      style="width: {8 * scale}px; height: {5 * scale}px;"
      fill="currentColor"
    >
      <path d="M0 0 L5 6 L10 0 Z" />
    </svg>
  </div>
</div>
