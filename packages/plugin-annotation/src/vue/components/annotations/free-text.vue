<template>
  <div
    :style="{
      position: 'absolute',
      width: `${annotation.object.rect.size.width * scale}px`,
      height: `${annotation.object.rect.size.height * scale}px`,
      cursor: isSelected && !isEditing ? 'move' : 'default',
      pointerEvents: !onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto',
      zIndex: 2,
      opacity: appearanceActive ? 0 : 1,
    }"
    @pointerdown="onClick"
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

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import {
  PdfFreeTextAnnoObject,
  PdfVerticalAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability, useIOSZoomPrevention } from '../../hooks';

const props = withDefaults(
  defineProps<{
    documentId: string;
    isSelected: boolean;
    isEditing: boolean;
    annotation: TrackedAnnotation<PdfFreeTextAnnoObject>;
    pageIndex: number;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    appearanceActive: false,
  },
);

const editorRef = ref<HTMLSpanElement | null>(null);
const editingRef = ref(false);
const { provides: annotationCapability } = useAnnotationCapability();
const annotationProvides = computed(
  () => annotationCapability.value?.forDocument(props.documentId) ?? null,
);
const ios = useIOSZoomPrevention(
  () => props.annotation.object.fontSize * props.scale,
  () => props.isEditing,
);

watch(
  () => props.isEditing,
  async (editing) => {
    if (!editing) return;
    await nextTick();
    if (!editorRef.value) return;
    editingRef.value = true;
    const editor = editorRef.value;
    editor.focus();

    const tool = annotationProvides.value?.findToolForAnnotation(props.annotation.object);
    const isDefaultContent =
      tool?.defaults?.contents != null &&
      props.annotation.object.contents === tool.defaults.contents;

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      if (!isDefaultContent) {
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    }
  },
  { immediate: true },
);

const handleBlur = () => {
  if (!editingRef.value) return;
  editingRef.value = false;
  if (!annotationProvides.value || !editorRef.value) return;
  annotationProvides.value.updateAnnotation(props.pageIndex, props.annotation.object.id, {
    contents: editorRef.value.innerText.replace(/\u00A0/g, ' '),
  });
};

const editorStyle = computed(() => {
  const { object: anno } = props.annotation;
  const { needsComp, adjustedFontPx, scaleComp } = ios.value;
  const invScalePercent = needsComp ? 100 / scaleComp : 100;

  return {
    color: anno.fontColor,
    fontSize: `${adjustedFontPx}px`,
    ...standardFontCssProperties(anno.fontFamily),
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
    cursor: props.isEditing ? 'text' : props.onClick ? 'pointer' : 'default',
    outline: 'none',
    transform: needsComp ? `scale(${scaleComp})` : undefined,
    transformOrigin: 'top left',
  };
});
</script>
