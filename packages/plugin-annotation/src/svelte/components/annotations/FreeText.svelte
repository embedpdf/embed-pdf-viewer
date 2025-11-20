<!-- Free-text.svelte -->
<script lang="ts">
    import  {
        type PdfFreeTextAnnoObject,
        PdfVerticalAlignment,
        standardFontCss,
        textAlignmentToCss
    } from '@embedpdf/models';
    import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
    import {useAnnotationCapability} from "../../hooks";


    // ---------- props ----------
    interface FreeTextProps {
        isSelected: boolean;
        isEditing: boolean;
        annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
        pageIndex: number;
        scale: number;
        onClick?: (e: MouseEvent | TouchEvent) => void;
        onDoubleClick?: (e: MouseEvent) => void;
    }

    let {
        isSelected,
        isEditing,
        annotation,
        pageIndex,
        scale,
        onClick,
    }: FreeTextProps = $props();

    // ---------- capabilities ----------
    const annotationCapability = useAnnotationCapability();

    // ---------- refs / state ----------
    let editorRef: HTMLSpanElement | null = null;
    let isIOS = $state(false);

    // Focus and move caret to end when entering edit mode
    $effect(() => {
        if (!isEditing || !editorRef) return;
        editorRef.focus();

        const selection = window.getSelection?.();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(editorRef);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });

    // One-time iOS detection (prevents zoom by font-size compensation)
    $effect.pre(() => {
        try {
            const nav = navigator as any;
            const ios =
                /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
            isIOS = ios;
        } catch {
            isIOS = false;
        }
    });

    // Persist contents on blur
    function handleBlur() {
        if (!annotationCapability.provides || !editorRef) return;
        annotationCapability.provides.updateAnnotation(pageIndex, annotation.object.id, {
            contents: editorRef.innerText
        });
    }

    // ---------- iOS zoom compensation ----------
    const computedFontPx = $derived(annotation.object.fontSize * scale);
    const MIN_IOS_FOCUS_FONT_PX = 16;
    const needsComp = $derived(
        isIOS && isEditing && computedFontPx > 0 && computedFontPx < MIN_IOS_FOCUS_FONT_PX
    );
    const adjustedFontPx = $derived(needsComp ? MIN_IOS_FOCUS_FONT_PX : computedFontPx);
    const scaleComp = $derived(needsComp ? computedFontPx / MIN_IOS_FOCUS_FONT_PX : 1);
    const invScalePercent = $derived(needsComp ? 100 / scaleComp : 100);

    // ---------- derived sizes ----------
    const outerW = $derived(annotation.object.rect.size.width * scale);
    const outerH = $derived(annotation.object.rect.size.height * scale);

    const justify = $derived(
        annotation.object.verticalAlign === PdfVerticalAlignment.Top
            ? 'flex-start'
            : annotation.object.verticalAlign === PdfVerticalAlignment.Middle
                ? 'center'
                : 'flex-end'
    );
</script>

<!-- Outer positioned container -->
<div
        style:position="absolute"
        style:width={`${outerW}px`}
        style:height={`${outerH}px`}
        style:z-index={2}
        style:cursor={(isSelected && !isEditing) ? 'move' : 'default'}
        style:pointer-events={(isSelected && !isEditing) ? 'none' : 'auto'}
        onpointerdown={onClick}
        ontouchstart={onClick}
>
    <!-- Editable span -->
    <span
            bind:this={editorRef}
            tabindex="0"
            contenteditable={isEditing}
            onblur={handleBlur}
            style:display="flex"
            style:flex-direction="column"
            style:justify-content={justify}
            style:color={annotation.object.fontColor}
            style:font-size={`${adjustedFontPx}px`}
            style:font-family={standardFontCss(annotation.object.fontFamily)}
            style:text-align={textAlignmentToCss(annotation.object.textAlign)}
            style:background-color={annotation.object.backgroundColor}
            style:opacity={annotation.object.opacity}
            style:width={needsComp ? `${invScalePercent}%` : '100%'}
            style:height={needsComp ? `${invScalePercent}%` : '100%'}
            style:line-height="1.18"
            style:overflow="hidden"
            style:cursor={isEditing ? 'text' : 'pointer'}
            style:outline="none"
            style:transform={needsComp ? `scale(${scaleComp})` : undefined}
            style:transform-origin="top left"
    >{annotation.object.contents}</span>
</div>