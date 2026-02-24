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

  const segmentRects = $derived(object.segmentRects ?? []);
  const rect = $derived(object.rect);

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
  role="group"
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  style:position="absolute"
  style:inset="0"
>
  {#each segmentRects as b, i (i)}
    {@const left = (rect ? b.origin.x - rect.origin.x : b.origin.x) * scale}
    {@const top = (rect ? b.origin.y - rect.origin.y : b.origin.y) * scale}
    {@const width = b.size.width * scale}
    {@const height = b.size.height * scale}
    {@const scaledFontSize = Math.min(fontSize * scale, height * 0.8)}
    <div
      role="button"
      tabindex="0"
      onpointerdown={onClick}
      ontouchstart={onClick}
      style:position="absolute"
      style:left="{left}px"
      style:top="{top}px"
      style:width="{width}px"
      style:height="{height}px"
      style:background={isHovered ? color : 'transparent'}
      style:border={!isHovered ? `2px solid ${strokeColor}` : 'none'}
      style:opacity={isHovered ? opacity : 1}
      style:box-sizing="border-box"
      style:pointer-events="auto"
      style:cursor="pointer"
      style:display="flex"
      style:align-items="center"
      style:justify-content={justifyContent}
      style:overflow="hidden"
    >
      {#if isHovered && overlayText}
        <span
          style:color={textColor}
          style:font-size="{scaledFontSize}px"
          style:font-family={fontCss.fontFamily}
          style:font-weight={fontCss.fontWeight}
          style:font-style={fontCss.fontStyle}
          style:text-align={textAlignmentToCss(textAlign)}
          style:white-space={overlayTextRepeat ? 'normal' : 'nowrap'}
          style:overflow="hidden"
          style:text-overflow="ellipsis"
          style:line-height="1"
        >
          {renderOverlayText()}
        </span>
      {/if}
    </div>
  {/each}
</div>
