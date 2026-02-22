<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import type { PdfRedactAnnoObject } from '@embedpdf/models';
  import {
    PdfStandardFont,
    PdfTextAlignment,
    standardFontCssProperties,
    textAlignmentToCss,
  } from '@embedpdf/models';

  let { annotation, isSelected, scale, onClick }: AnnotationRendererProps<PdfRedactAnnoObject> =
    $props();
  let isHovered = $state(false);

  const object = $derived(annotation.object);

  // C - Border/stroke color
  const strokeColor = $derived(object.strokeColor ?? '#FF0000');
  // IC - Interior color (background fill when redaction is applied)
  const color = $derived(object.color ?? '#000000');
  // CA - Opacity (0-1)
  const opacity = $derived(object.opacity ?? 1);
  // OC - Overlay text color (Adobe extension), fallback to fontColor
  const textColor = $derived(object.fontColor ?? object.overlayColor ?? '#FFFFFF');
  // Overlay text properties
  const overlayText = $derived(object.overlayText);
  const overlayTextRepeat = $derived(object.overlayTextRepeat ?? false);
  const fontSize = $derived(object.fontSize ?? 12);
  const fontFamily = $derived(object.fontFamily ?? PdfStandardFont.Helvetica);
  const fontCss = $derived(standardFontCssProperties(fontFamily));
  const textAlign = $derived(object.textAlign ?? PdfTextAlignment.Center);

  // Calculate how many times to repeat text (approximate)
  function renderOverlayText(): string | null {
    if (!overlayText) return null;
    if (!overlayTextRepeat) return overlayText;
    // Repeat text multiple times to fill the space
    const reps = 10;
    return Array(reps).fill(overlayText).join(' ');
  }

  const justifyContent = $derived(
    textAlign === PdfTextAlignment.Left
      ? 'flex-start'
      : textAlign === PdfTextAlignment.Right
        ? 'flex-end'
        : 'center',
  );
</script>

<div
  role="button"
  tabindex="0"
  onpointerdown={(e) => {
    if (!isSelected) onClick(e);
  }}
  ontouchstart={(e) => {
    if (!isSelected) onClick(e);
  }}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  style:position="absolute"
  style:inset="0"
  style:background={isHovered ? color : 'transparent'}
  style:border={!isHovered ? `2px solid ${strokeColor}` : 'none'}
  style:opacity={isHovered ? opacity : 1}
  style:box-sizing="border-box"
  style:pointer-events="auto"
  style:cursor={isSelected ? 'move' : 'pointer'}
  style:display="flex"
  style:align-items="center"
  style:justify-content={justifyContent}
  style:overflow="hidden"
>
  {#if isHovered && overlayText}
    <span
      style:color={textColor}
      style:font-size="{fontSize * scale}px"
      style:font-family={fontCss.fontFamily}
      style:font-weight={fontCss.fontWeight}
      style:font-style={fontCss.fontStyle}
      style:text-align={textAlignmentToCss(textAlign)}
      style:white-space={overlayTextRepeat ? 'normal' : 'nowrap'}
      style:overflow="hidden"
      style:text-overflow="ellipsis"
      style:padding="4px"
    >
      {renderOverlayText()}
    </span>
  {/if}
</div>
