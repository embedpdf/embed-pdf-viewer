<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { SignatureStampFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
import { cropCanvas } from '../../shared/components/crop-canvas';

const props = withDefaults(
  defineProps<{
    onResult: (result: SignatureStampFieldDefinition | null) => void;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    placeholder?: string;
  }>(),
  {
    fontFamily: "'Dancing Script', cursive",
    fontSize: 48,
    color: '#000000',
    placeholder: 'Type your signature...',
  },
);

const wrapperRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const text = ref('');
const inputId = `sig-type-${Math.random().toString(36).slice(2, 8)}`;
let size = { width: 0, height: 0 };
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
let observer: ResizeObserver | null = null;

const placeholderStyle = computed(
  () => `#${inputId}::placeholder { color: ${props.color}; opacity: 0.5; }`,
);

const inputStyle = computed(() => ({
  fontFamily: props.fontFamily,
  fontSize: `${Math.min(props.fontSize, 32)}px`,
  color: props.color,
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  textIndent: '8px',
}));

function renderText(currentText: string) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const { width, height } = size;
  if (width === 0 || height === 0) return;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!currentText.trim()) {
    props.onResult(null);
    return;
  }

  ctx.scale(dpr, dpr);
  ctx.fillStyle = props.color;
  ctx.font = `${props.fontSize}px ${props.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(currentText, width / 2, height / 2, width - 20);

  const cropped = cropCanvas(canvas, Math.ceil(4 * dpr));
  if (!cropped) {
    props.onResult(null);
    return;
  }

  const croppedWidth = Math.round(cropped.bounds.width / dpr);
  const croppedHeight = Math.round(cropped.bounds.height / dpr);

  cropped.canvas.toBlob((blob) => {
    if (!blob) return;
    blob.arrayBuffer().then((imageData) => {
      const result: SignatureStampFieldDefinition = {
        creationType: SignatureCreationType.Type,
        label: currentText,
        imageMimeType: 'image/png',
        imageSize: { width: croppedWidth, height: croppedHeight },
        previewDataUrl: cropped.canvas.toDataURL('image/png'),
        imageData,
      };
      props.onResult(result);
    });
  }, 'image/png');
}

function clear() {
  text.value = '';
  props.onResult(null);
}

defineExpose({ clear });

function handleInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value;
}

watch([text, () => props.fontFamily, () => props.color], () => {
  renderText(text.value);
});

onMounted(() => {
  const wrapper = wrapperRef.value;
  if (!wrapper) return;
  observer = new ResizeObserver((entries) => {
    const { width: w, height: h } = entries[0].contentRect;
    if (w > 0 && h > 0) {
      size = { width: Math.round(w), height: Math.round(h) };
      renderText(text.value);
    }
  });
  observer.observe(wrapper);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="wrapperRef" :style="{ width: '100%', height: '100%' }">
    <component is="style" v-text="placeholderStyle" />
    <input
      :id="inputId"
      type="text"
      :value="text"
      @input="handleInput"
      :placeholder="placeholder"
      :style="inputStyle"
    />
    <canvas ref="canvasRef" :style="{ display: 'none' }" />
  </div>
</template>
