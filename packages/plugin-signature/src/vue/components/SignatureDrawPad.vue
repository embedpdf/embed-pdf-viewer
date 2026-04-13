<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { SignatureInkFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
import { cropCanvas } from '../../shared/components/crop-canvas';

const props = withDefaults(
  defineProps<{
    onResult: (result: SignatureInkFieldDefinition | null) => void;
    strokeColor?: string;
    strokeWidth?: number;
  }>(),
  {
    strokeColor: '#000000',
    strokeWidth: 4,
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const strokes = ref<Array<{ points: Array<{ x: number; y: number }> }>>([]);
let isDrawing = false;
let size = { width: 0, height: 0 };
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
let observer: ResizeObserver | null = null;

function getCanvasPos(e: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / dpr / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / dpr / rect.height),
  };
}

function redraw(currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = props.strokeColor;
  ctx.lineWidth = props.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of currentStrokes) {
    if (stroke.points.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function emitResult(currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) {
  if (currentStrokes.length === 0 || currentStrokes.every((s) => s.points.length < 2)) {
    props.onResult(null);
    return;
  }

  const canvas = canvasRef.value;
  if (!canvas) return;

  const cropped = cropCanvas(canvas, Math.ceil(props.strokeWidth * dpr));
  if (!cropped) {
    props.onResult(null);
    return;
  }

  const offsetX = cropped.bounds.x / dpr;
  const offsetY = cropped.bounds.y / dpr;
  const croppedWidth = Math.round(cropped.bounds.width / dpr);
  const croppedHeight = Math.round(cropped.bounds.height / dpr);

  const result: SignatureInkFieldDefinition = {
    creationType: SignatureCreationType.Draw,
    inkData: {
      inkList: currentStrokes
        .filter((s) => s.points.length >= 2)
        .map((s) => ({
          points: s.points.map((p) => ({
            x: p.x - offsetX,
            y: p.y - offsetY,
          })),
        })),
      strokeWidth: props.strokeWidth,
      strokeColor: props.strokeColor,
      size: { width: croppedWidth, height: croppedHeight },
    },
    previewDataUrl: cropped.canvas.toDataURL('image/png'),
  };

  props.onResult(result);
}

function clear() {
  strokes.value = [];
  redraw([]);
  props.onResult(null);
}

defineExpose({ clear });

function handlePointerDown(e: PointerEvent) {
  isDrawing = true;
  const pos = getCanvasPos(e);
  strokes.value = [...strokes.value, { points: [pos] }];
  redraw(strokes.value);
  (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  const last = strokes.value[strokes.value.length - 1];
  if (last) {
    last.points.push(pos);
    strokes.value = [...strokes.value];
    redraw(strokes.value);
  }
}

function handlePointerUp(e: PointerEvent) {
  isDrawing = false;
  (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  emitResult(strokes.value);
}

watch([() => props.strokeColor, () => props.strokeWidth], () => {
  redraw(strokes.value);
  if (strokes.value.length > 0 && strokes.value.some((s) => s.points.length >= 2)) {
    emitResult(strokes.value);
  }
});

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  observer = new ResizeObserver((entries) => {
    const { width: w, height: h } = entries[0].contentRect;
    if (w > 0 && h > 0 && canvasRef.value) {
      size = { width: Math.round(w), height: Math.round(h) };
      canvasRef.value.width = Math.round(w) * dpr;
      canvasRef.value.height = Math.round(h) * dpr;
      redraw(strokes.value);
    }
  });
  observer.observe(canvas);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <canvas
    ref="canvasRef"
    :style="{ touchAction: 'none', width: '100%', height: '100%', display: 'block' }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
  />
</template>
