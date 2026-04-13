<script lang="ts">
  import {
    type PdfFreeTextAnnoObject,
    PdfVerticalAlignment,
    standardFontCssProperties,
    textAlignmentToCss,
  } from '@embedpdf/models';
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { useAnnotationCapability, useIOSZoomPrevention } from '../../hooks';

  interface FreeTextProps {
    documentId: string;
    isSelected: boolean;
    isEditing: boolean;
    annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
    pageIndex: number;
    scale: number;
    onClick?: (e: MouseEvent) => void;
    onDoubleClick?: (e: MouseEvent) => void;
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
  }: FreeTextProps = $props();

  const annotationCapability = useAnnotationCapability();

  const annotationProvides = $derived(
    annotationCapability.provides ? annotationCapability.provides.forDocument(documentId) : null,
  );

  let editorRef: HTMLSpanElement | null = null;
  let editingRef = false;

  $effect(() => {
    if (!isEditing || !editorRef) return;
    editingRef = true;
    editorRef.focus();

    const tool = annotationProvides?.findToolForAnnotation(annotation.object);
    const isDefaultContent =
      tool?.defaults?.contents != null && annotation.object.contents === tool.defaults.contents;

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
    annotationProvides.updateAnnotation(pageIndex, annotation.object.id, {
      contents: editorRef.innerText.replace(/\u00A0/g, ' '),
    });
  }

  const ios = useIOSZoomPrevention(
    () => annotation.object.fontSize * scale,
    () => isEditing,
  );
  const invScalePercent = $derived(ios.needsComp ? 100 / ios.scaleComp : 100);

  const outerW = $derived(annotation.object.rect.size.width * scale);
  const outerH = $derived(annotation.object.rect.size.height * scale);

  const justify = $derived(
    annotation.object.verticalAlign === PdfVerticalAlignment.Top
      ? 'flex-start'
      : annotation.object.verticalAlign === PdfVerticalAlignment.Middle
        ? 'center'
        : 'flex-end',
  );

  const fontCss = $derived(standardFontCssProperties(annotation.object.fontFamily));
</script>

<div
  role="button"
  tabindex={-1}
  style:position="absolute"
  style:width={`${outerW}px`}
  style:height={`${outerH}px`}
  style:z-index={2}
  style:cursor={isSelected && !isEditing ? 'move' : 'default'}
  style:pointer-events={!onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto'}
  style:opacity={appearanceActive ? 0 : 1}
  onpointerdown={onClick}
>
  <span
    bind:this={editorRef}
    role="textbox"
    tabindex="0"
    contenteditable={isEditing}
    onblur={handleBlur}
    style:display="flex"
    style:flex-direction="column"
    style:justify-content={justify}
    style:color={annotation.object.fontColor}
    style:font-size={`${ios.adjustedFontPx}px`}
    style:font-family={fontCss.fontFamily}
    style:font-weight={fontCss.fontWeight}
    style:font-style={fontCss.fontStyle}
    style:text-align={textAlignmentToCss(annotation.object.textAlign)}
    style:background-color={annotation.object.color ?? annotation.object.backgroundColor}
    style:opacity={annotation.object.opacity}
    style:width={ios.needsComp ? `${invScalePercent}%` : '100%'}
    style:height={ios.needsComp ? `${invScalePercent}%` : '100%'}
    style:line-height="1.18"
    style:overflow="hidden"
    style:cursor={isEditing ? 'text' : onClick ? 'pointer' : 'default'}
    style:outline="none"
    style:transform={ios.needsComp ? `scale(${ios.scaleComp})` : undefined}
    style:transform-origin="top left">{annotation.object.contents}</span
  >
</div>
