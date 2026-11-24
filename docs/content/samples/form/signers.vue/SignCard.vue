<!-- A signer pressed their signature field, with a click or with Tab and Space: the field is the
     signature plugin's target, and this card opens next to it. What they draw goes into the field. -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Anchored } from '@embedpdf/vue/anchored';
import { useForm, useFormWidgetAnchor } from '@embedpdf/vue/form';
import { useSignature, useSignatureState } from '@embedpdf/vue/signature';

const INK = '#1d2b53';
type Point = { x: number; y: number };

const form = useForm();
const signature = useSignature();
const { target } = useSignatureState();
const anchor = useFormWidgetAnchor(() =>
  target.value ? (form.getWidgets(target.value)[0]?.ref ?? null) : null,
);
const card = ref<HTMLDivElement | null>(null);
const pad = ref<HTMLCanvasElement | null>(null);
const drawn = ref(false);
let last: Point | null = null;

// Each field starts with an empty pad, and the card takes the cursor, so Escape closes it.
watch(
  [target, card],
  () => {
    last = null;
    drawn.value = false;
    pad.value?.getContext('2d')?.clearRect(0, 0, pad.value.width, pad.value.height);
    if (target.value) card.value?.focus();
  },
  { flush: 'post' },
);

const pointOf = (event: PointerEvent, canvas: HTMLCanvasElement): Point => {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

const start = (event: PointerEvent) => {
  const canvas = event.currentTarget as HTMLCanvasElement;
  canvas.setPointerCapture(event.pointerId);
  last = pointOf(event, canvas);
};

const draw = (event: PointerEvent) => {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const from = last;
  const ink = canvas.getContext('2d');
  if (!from || !ink || !canvas.hasPointerCapture(event.pointerId)) return;
  const to = pointOf(event, canvas);
  last = to;
  ink.strokeStyle = INK;
  ink.lineWidth = 2;
  ink.lineCap = 'round';
  ink.beginPath();
  ink.moveTo(from.x, from.y);
  ink.lineTo(to.x, to.y);
  ink.stroke();
  drawn.value = true;
};

// Close without signing, and put the cursor back on the field.
const close = () => {
  const field = target.value;
  signature.setTarget(null);
  if (field) form.focus(field);
};

// The drawing goes into the field as a picture.
const sign = () => {
  const field = target.value;
  pad.value?.toBlob(async (png) => {
    if (!field || !png) return;
    await signature.placeMark({ source: png }, { field });
    form.focus(field);
  });
};
</script>

<template>
  <Anchored v-if="target" :anchor="anchor" placement="bottom-start" :gap="8">
    <div
      ref="card"
      class="sign-card"
      role="dialog"
      aria-label="Draw your signature"
      tabindex="-1"
      @keydown.esc="close"
    >
      <canvas
        ref="pad"
        class="sign-pad"
        width="240"
        height="100"
        @pointerdown="start"
        @pointermove="draw"
      />
      <div class="sign-actions">
        <button type="button" class="button" @click="close">Cancel</button>
        <button type="button" class="button" :disabled="!drawn" @click="sign">Sign</button>
      </div>
    </div>
  </Anchored>
</template>
