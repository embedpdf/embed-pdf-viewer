<script lang="ts">
  import {
    type PdfFreeTextAnnoObject,
    PdfVerticalAlignment,
    standardFontCssProperties,
    textAlignmentToCss,
  } from '@embedpdf/models';
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { patching } from '@embedpdf/plugin-annotation';
  import { useAnnotationCapability, useIOSZoomPrevention } from '../../hooks';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface CalloutFreeTextProps {
    documentId: string;
    isSelected: boolean;
    isEditing: boolean;
    annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
    pageIndex: number;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    appearanceActive?: boolean;
  }

  let {
    documentId,
    isSelected,
    isEditing,
    annotation,
    pageIndex,
    scale,
    onClick,
    appearanceActive = false,
  }: CalloutFreeTextProps = $props();

  const annotationCapability = useAnnotationCapability();
  const annotationProvides = $derived(
    annotationCapability.provides ? annotationCapability.provides.forDocument(documentId) : null,
  );

  let editorRef: HTMLSpanElement | null = null;
  let editingRef = false;

  const obj = $derived(annotation.object);
  const rect = $derived(obj.rect);
  const strokeWidth = $derived(obj.strokeWidth ?? 1);
  const strokeColor = $derived(obj.strokeColor ?? '#000000');

  const textBox = $derived(patching.computeTextBoxFromRD(rect, obj.rectangleDifferences));

  const textBoxRelative = $derived({
    left: (textBox.origin.x - rect.origin.x + strokeWidth / 2) * scale,
    top: (textBox.origin.y - rect.origin.y + strokeWidth / 2) * scale,
    width: (textBox.size.width - strokeWidth) * scale,
    height: (textBox.size.height - strokeWidth) * scale,
  });

  const lineCoords = $derived.by(() => {
    const cl = obj.calloutLine;
    if (!cl || cl.length < 3) return null;
    return cl.map((p) => ({ x: p.x - rect.origin.x, y: p.y - rect.origin.y }));
  });

  const ending = $derived.by(() => {
    if (!lineCoords || lineCoords.length < 2) return null;
    const angle = Math.atan2(lineCoords[1].y - lineCoords[0].y, lineCoords[1].x - lineCoords[0].x);
    return patching.createEnding(
      obj.lineEnding,
      strokeWidth,
      angle + Math.PI,
      lineCoords[0].x,
      lineCoords[0].y,
    );
  });

  const visualLineCoords = $derived.by(() => {
    if (!lineCoords || lineCoords.length < 2) return lineCoords;
    const pts = lineCoords.map((p) => ({ ...p }));
    const last = pts.length - 1;
    const prev = last - 1;
    const dx = pts[last].x - pts[prev].x;
    const dy = pts[last].y - pts[prev].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const halfBw = strokeWidth / 2;
      pts[last].x += (dx / len) * halfBw;
      pts[last].y += (dy / len) * halfBw;
    }
    return pts;
  });

  const ios = useIOSZoomPrevention(
    () => obj.fontSize * scale,
    () => isEditing,
  );

  const width = $derived(rect.size.width * scale);
  const height = $derived(rect.size.height * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));
  const fontCss = $derived(standardFontCssProperties(obj.fontFamily));

  const justify = $derived(
    obj.verticalAlign === PdfVerticalAlignment.Top
      ? 'flex-start'
      : obj.verticalAlign === PdfVerticalAlignment.Middle
        ? 'center'
        : 'flex-end',
  );

  $effect(() => {
    if (!isEditing || !editorRef) return;
    editingRef = true;
    editorRef.focus();

    const tool = annotationProvides?.findToolForAnnotation(obj);
    const isDefaultContent =
      tool?.defaults?.contents != null && obj.contents === tool.defaults.contents;

    const selection = window.getSelection?.();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editorRef);
    if (!isDefaultContent) {
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  });

  function handleBlur() {
    if (!editingRef) return;
    editingRef = false;
    if (!annotationProvides || !editorRef) return;
    annotationProvides.updateAnnotation(pageIndex, obj.id, {
      contents: editorRef.innerText.replace(/\u00A0/g, ' '),
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style:position="absolute"
  style:width={`${width}px`}
  style:height={`${height}px`}
  style:cursor={isSelected && !isEditing ? 'move' : 'default'}
  style:pointer-events="none"
  style:z-index={2}
  style:opacity={appearanceActive ? 0 : 1}
>
  <svg
    style="position: absolute; pointer-events: none; overflow: visible;"
    style:width={`${width}px`}
    style:height={`${height}px`}
    {width}
    {height}
    viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
  >
    {#if lineCoords}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <polyline
        points={lineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        stroke-width={hitStrokeWidth}
        onpointerdown={onClick ? (e) => onClick(e) : undefined}
        style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
        style:pointer-events={!onClick ? 'none' : isSelected ? 'none' : 'visibleStroke'}
      />
      {#if ending}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <path
          d={ending.d}
          transform={ending.transform}
          fill="transparent"
          stroke="transparent"
          stroke-width={hitStrokeWidth}
          onpointerdown={onClick ? (e) => onClick(e) : undefined}
          style:cursor={isSelected ? 'move' : onClick ? 'pointer' : 'default'}
          style:pointer-events={!onClick
            ? 'none'
            : isSelected
              ? 'none'
              : ending.filled
                ? 'visible'
                : 'visibleStroke'}
        />
      {/if}
    {/if}

    {#if !appearanceActive}
      {#if visualLineCoords}
        <polyline
          points={visualLineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={strokeColor}
          stroke-width={strokeWidth}
          opacity={obj.opacity}
          style:pointer-events="none"
        />
        {#if ending}
          <path
            d={ending.d}
            transform={ending.transform}
            stroke={strokeColor}
            fill={ending.filled ? (obj.color ?? 'transparent') : 'none'}
            stroke-width={strokeWidth}
            opacity={obj.opacity}
            style:pointer-events="none"
          />
        {/if}
      {/if}
      <rect
        x={textBox.origin.x - rect.origin.x + strokeWidth / 2}
        y={textBox.origin.y - rect.origin.y + strokeWidth / 2}
        width={textBox.size.width - strokeWidth}
        height={textBox.size.height - strokeWidth}
        fill={obj.color ?? obj.backgroundColor ?? 'transparent'}
        stroke={strokeColor}
        stroke-width={strokeWidth}
        opacity={obj.opacity}
        style:pointer-events="none"
      />
    {/if}
  </svg>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onpointerdown={onClick ? (e) => onClick(e) : undefined}
    style:position="absolute"
    style:left={`${(textBox.origin.x - rect.origin.x) * scale}px`}
    style:top={`${(textBox.origin.y - rect.origin.y) * scale}px`}
    style:width={`${textBox.size.width * scale}px`}
    style:height={`${textBox.size.height * scale}px`}
    style:cursor={isSelected && !isEditing ? 'move' : onClick ? 'pointer' : 'default'}
    style:pointer-events={!onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto'}
  ></div>

  <span
    bind:this={editorRef}
    role="textbox"
    tabindex="0"
    contenteditable={isEditing}
    onblur={handleBlur}
    style:position="absolute"
    style:left={`${textBoxRelative.left}px`}
    style:top={`${textBoxRelative.top}px`}
    style:width={`${textBoxRelative.width}px`}
    style:height={`${textBoxRelative.height}px`}
    style:color={obj.fontColor}
    style:font-size={`${ios.adjustedFontPx}px`}
    style:font-family={fontCss.fontFamily}
    style:font-weight={fontCss.fontWeight}
    style:font-style={fontCss.fontStyle}
    style:text-align={textAlignmentToCss(obj.textAlign)}
    style:flex-direction="column"
    style:justify-content={justify}
    style:display="flex"
    style:padding={`${(strokeWidth * scale) / 2 + 2 * scale}px`}
    style:opacity={obj.opacity}
    style:line-height="1.18"
    style:overflow="hidden"
    style:cursor={isEditing ? 'text' : 'default'}
    style:outline="none"
    style:pointer-events={isEditing ? 'auto' : 'none'}>{obj.contents}</span
  >
</div>
