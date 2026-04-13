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
  const options = $derived(field.type === PDF_FORM_FIELD_TYPE.LISTBOX ? field.options : []);
  const borderWidth = $derived((object.strokeWidth ?? 1) * scale);
  const fontSize = $derived((object.fontSize ?? 12) * scale);
  const lineHeight = $derived(fontSize * 1.2);
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
  style:overflow="hidden"
  style:display="flex"
  style:flex-direction="column"
>
  {#each options as opt}
    <div
      style:padding="0 {4 * scale}px"
      style:font-size="{fontSize}px"
      style:line-height="{lineHeight}px"
      style:font-family={fontCss.fontFamily}
      style:font-weight={fontCss.fontWeight}
      style:font-style={fontCss.fontStyle}
      style:color={opt.isSelected ? '#FFFFFF' : (object.fontColor ?? '#000000')}
      style:background={opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent'}
      style:white-space="nowrap"
      style:overflow="hidden"
      style:text-overflow="ellipsis"
    >
      {opt.label}
    </div>
  {/each}
</div>
