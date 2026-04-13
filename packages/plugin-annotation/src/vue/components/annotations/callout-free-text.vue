<template>
  <div
    :style="{
      position: 'absolute',
      width: `${width}px`,
      height: `${height}px`,
      cursor: isSelected && !isEditing ? 'move' : 'default',
      pointerEvents: 'none',
      zIndex: 2,
      opacity: appearanceActive ? 0 : 1,
    }"
  >
    <svg
      :style="{
        position: 'absolute',
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        overflow: 'visible',
      }"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${obj.rect.size.width} ${obj.rect.size.height}`"
    >
      <!-- Hit areas for the callout line -->
      <template v-if="lineCoords">
        <polyline
          :points="lineCoords.map((p: any) => `${p.x},${p.y}`).join(' ')"
          fill="none"
          stroke="transparent"
          :stroke-width="hitStrokeWidth"
          @pointerdown="onClick"
          :style="{
            cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
            pointerEvents: !onClick ? 'none' : isSelected ? 'none' : 'visibleStroke',
          }"
        />
        <path
          v-if="ending"
          :d="ending.d"
          :transform="ending.transform"
          fill="transparent"
          stroke="transparent"
          :stroke-width="hitStrokeWidth"
          @pointerdown="onClick"
          :style="{
            cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
            pointerEvents: !onClick
              ? 'none'
              : isSelected
                ? 'none'
                : ending.filled
                  ? 'visible'
                  : 'visibleStroke',
          }"
        />
      </template>

      <!-- Visual callout line + text box rect -->
      <template v-if="!appearanceActive">
        <template v-if="visualLineCoords">
          <polyline
            :points="visualLineCoords.map((p: any) => `${p.x},${p.y}`).join(' ')"
            fill="none"
            :stroke="strokeColor"
            :stroke-width="strokeWidth"
            :opacity="obj.opacity"
            style="pointer-events: none"
          />
          <path
            v-if="ending"
            :d="ending.d"
            :transform="ending.transform"
            :stroke="strokeColor"
            :fill="ending.filled ? (obj.color ?? 'transparent') : 'none'"
            :stroke-width="strokeWidth"
            :opacity="obj.opacity"
            style="pointer-events: none"
          />
        </template>
        <rect
          :x="textBox.origin.x - obj.rect.origin.x + strokeWidth / 2"
          :y="textBox.origin.y - obj.rect.origin.y + strokeWidth / 2"
          :width="textBox.size.width - strokeWidth"
          :height="textBox.size.height - strokeWidth"
          :fill="obj.color ?? obj.backgroundColor ?? 'transparent'"
          :stroke="strokeColor"
          :stroke-width="strokeWidth"
          :opacity="obj.opacity"
          style="pointer-events: none"
        />
      </template>
    </svg>

    <!-- Text box hit area -->
    <div
      @pointerdown="onClick"
      :style="{
        position: 'absolute',
        left: `${(textBox.origin.x - obj.rect.origin.x) * scale}px`,
        top: `${(textBox.origin.y - obj.rect.origin.y) * scale}px`,
        width: `${textBox.size.width * scale}px`,
        height: `${textBox.size.height * scale}px`,
        cursor: isSelected && !isEditing ? 'move' : onClick ? 'pointer' : 'default',
        pointerEvents: !onClick ? 'none' : isSelected && !isEditing ? 'none' : 'auto',
      }"
    />

    <!-- Text content -->
    <span
      ref="editorRef"
      @blur="handleBlur"
      tabindex="0"
      :style="editorStyle"
      :contenteditable="isEditing"
      >{{ obj.contents }}</span
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
import { TrackedAnnotation, patching } from '@embedpdf/plugin-annotation';
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

const obj = computed(() => props.annotation.object);
const strokeWidth = computed(() => obj.value.strokeWidth ?? 1);
const strokeColor = computed(() => obj.value.strokeColor ?? '#000000');

const editorRef = ref<HTMLSpanElement | null>(null);
const editingRef = ref(false);
const { provides: annotationCapability } = useAnnotationCapability();
const annotationProvides = computed(
  () => annotationCapability.value?.forDocument(props.documentId) ?? null,
);

const textBox = computed(() =>
  patching.computeTextBoxFromRD(obj.value.rect, obj.value.rectangleDifferences),
);

const textBoxRelative = computed(() => ({
  left: (textBox.value.origin.x - obj.value.rect.origin.x + strokeWidth.value / 2) * props.scale,
  top: (textBox.value.origin.y - obj.value.rect.origin.y + strokeWidth.value / 2) * props.scale,
  width: (textBox.value.size.width - strokeWidth.value) * props.scale,
  height: (textBox.value.size.height - strokeWidth.value) * props.scale,
}));

const lineCoords = computed(() => {
  const cl = obj.value.calloutLine;
  if (!cl || cl.length < 3) return null;
  return cl.map((p) => ({
    x: p.x - obj.value.rect.origin.x,
    y: p.y - obj.value.rect.origin.y,
  }));
});

const ending = computed(() => {
  const lc = lineCoords.value;
  if (!lc || lc.length < 2) return null;
  const angle = Math.atan2(lc[1].y - lc[0].y, lc[1].x - lc[0].x);
  return patching.createEnding(
    obj.value.lineEnding,
    strokeWidth.value,
    angle + Math.PI,
    lc[0].x,
    lc[0].y,
  );
});

const visualLineCoords = computed(() => {
  const lc = lineCoords.value;
  if (!lc || lc.length < 2) return lc;
  const pts = lc.map((p) => ({ ...p }));
  const last = pts.length - 1;
  const prev = last - 1;
  const dx = pts[last].x - pts[prev].x;
  const dy = pts[last].y - pts[prev].y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const halfBw = strokeWidth.value / 2;
    pts[last].x += (dx / len) * halfBw;
    pts[last].y += (dy / len) * halfBw;
  }
  return pts;
});

const ios = useIOSZoomPrevention(
  () => obj.value.fontSize * props.scale,
  () => props.isEditing,
);

const width = computed(() => obj.value.rect.size.width * props.scale);
const height = computed(() => obj.value.rect.size.height * props.scale);
const hitStrokeWidth = computed(() => Math.max(strokeWidth.value, 20 / props.scale));

watch(
  () => props.isEditing,
  async (editing) => {
    if (!editing) return;
    await nextTick();
    if (!editorRef.value) return;
    editingRef.value = true;
    const editor = editorRef.value;
    editor.focus();

    const tool = annotationProvides.value?.findToolForAnnotation(obj.value);
    const isDefaultContent =
      tool?.defaults?.contents != null && obj.value.contents === tool.defaults.contents;

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
  annotationProvides.value.updateAnnotation(props.pageIndex, obj.value.id, {
    contents: editorRef.value.innerText.replace(/\u00A0/g, ' '),
  });
};

const editorStyle = computed(() => {
  const { adjustedFontPx } = ios.value;
  const tbr = textBoxRelative.value;

  return {
    position: 'absolute' as const,
    left: `${tbr.left}px`,
    top: `${tbr.top}px`,
    width: `${tbr.width}px`,
    height: `${tbr.height}px`,
    color: obj.value.fontColor,
    fontSize: `${adjustedFontPx}px`,
    ...standardFontCssProperties(obj.value.fontFamily),
    textAlign: textAlignmentToCss(obj.value.textAlign),
    flexDirection: 'column' as const,
    justifyContent:
      obj.value.verticalAlign === PdfVerticalAlignment.Top
        ? 'flex-start'
        : obj.value.verticalAlign === PdfVerticalAlignment.Middle
          ? 'center'
          : 'flex-end',
    display: 'flex',
    padding: `${(strokeWidth.value * props.scale) / 2 + 2 * props.scale}px`,
    opacity: obj.value.opacity,
    lineHeight: '1.18',
    overflow: 'hidden',
    cursor: props.isEditing ? 'text' : 'default',
    outline: 'none',
    pointerEvents: props.isEditing ? 'auto' : ('none' as any),
  };
});
</script>
