<template>
  <div
    :style="{
      position: 'absolute',
      width: `${annotation.object.rect.size.width * scale}px`,
      height: `${annotation.object.rect.size.height * scale}px`,
      cursor: isSelected && !isEditing ? 'move' : 'default',
      pointerEvents: isSelected && !isEditing ? 'none' : 'auto',
      zIndex: 2,
    }"
    @pointerdown="onClick"
    @touchstart="onClick"
  >
    <span
      ref="editorRef"
      @blur="handleBlur"
      tabindex="0"
      :style="editorStyle"
      :contenteditable="isEditing"
      >{{ annotation.object.contents }}</span
    >
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import {
  PdfFreeTextAnnoObject,
  PdfVerticalAlignment,
  standardFontCss,
  textAlignmentToCss,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '../../hooks';

const props = defineProps<{
  isSelected: boolean;
  isEditing: boolean;
  annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
  pageIndex: number;
  scale: number;
  onClick?: (e: PointerEvent | TouchEvent) => void;
}>();

const editorRef = ref<HTMLSpanElement | null>(null);
const { provides: annotationProvides } = useAnnotationCapability();
const isIOS = ref(false);

onMounted(() => {
  try {
    const nav = navigator as any;
    isIOS.value =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  } catch {
    isIOS.value = false;
  }
});

watch(
  () => props.isEditing,
  (editing) => {
    if (editing && editorRef.value) {
      const editor = editorRef.value;
      editor.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  },
);

const handleBlur = () => {
  if (!annotationProvides.value || !editorRef.value) return;
  annotationProvides.value.updateAnnotation(props.pageIndex, props.annotation.object.id, {
    contents: editorRef.value.innerText,
  });
};

const editorStyle = computed(() => {
  const { object: anno } = props.annotation;
  const computedFontPx = anno.fontSize * props.scale;
  const MIN_IOS_FOCUS_FONT_PX = 16;
  const needsComp =
    isIOS.value && props.isEditing && computedFontPx > 0 && computedFontPx < MIN_IOS_FOCUS_FONT_PX;
  const adjustedFontPx = needsComp ? MIN_IOS_FOCUS_FONT_PX : computedFontPx;
  const scaleComp = needsComp ? computedFontPx / MIN_IOS_FOCUS_FONT_PX : 1;
  const invScalePercent = needsComp ? 100 / scaleComp : 100;

  return {
    color: anno.fontColor,
    fontSize: `${adjustedFontPx}px`,
    fontFamily: standardFontCss(anno.fontFamily),
    textAlign: textAlignmentToCss(anno.textAlign),
    flexDirection: 'column' as 'column',
    justifyContent:
      anno.verticalAlign === PdfVerticalAlignment.Top
        ? 'flex-start'
        : anno.verticalAlign === PdfVerticalAlignment.Middle
          ? 'center'
          : 'flex-end',
    display: 'flex',
    backgroundColor: anno.color ?? anno.backgroundColor,
    opacity: anno.opacity,
    width: needsComp ? `${invScalePercent}%` : '100%',
    height: needsComp ? `${invScalePercent}%` : '100%',
    lineHeight: '1.18',
    overflow: 'hidden',
    cursor: props.isEditing ? 'text' : 'pointer',
    outline: 'none',
    transform: needsComp ? `scale(${scaleComp})` : undefined,
    transformOrigin: 'top left',
  };
});
</script>
