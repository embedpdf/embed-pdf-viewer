<!-- Two edits after an approval signature: a comment keeps it valid, a new form field breaks it. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation } from '@embedpdf/vue/annotation';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useSignature, useSignatureEvent, useSignatureState } from '@embedpdf/vue/signature';

// EmbedPDF's signature field, signed before the agreement was sent.
const EMBEDPDF = toFieldRef('embedpdf');

const annotation = useAnnotation();
const form = useForm();
const stage = useStage();
const signature = useSignature();
const { signatures } = useSignatureState();
const status = useFormState((state) => state.status);
const warning = ref<string | null>(null);
const made = ref({ comment: false, field: false });
const signed = computed(() => signatures.value.find((each) => each.signed));

// Where the signature is: the edits go next to it.
function signatureWidget() {
  return form.getWidgets(EMBEDPDF)[0];
}

// On load: the signatures, in view. Nothing is changed until a button is pressed.
let revealed = false;
watch(
  status,
  (current) => {
    if (current !== 'ready' || revealed) return;
    revealed = true;
    const widget = signatureWidget();
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
  },
  { immediate: true },
);

// The moment a change would break a signature once it's saved, as Acrobat warns.
useSignatureEvent(
  (plugin) => plugin.onInvalidationPredicted,
  ({ field }) => {
    const name = signature.getSignature(field)?.fieldName;
    warning.value = `This change will break the signature in "${name}" when saved.`;
  },
);

async function addComment() {
  const widget = signatureWidget();
  if (!widget) return;
  const { rect } = widget;
  await annotation.create(widget.page, {
    subtype: 'text',
    rect: { x: rect.x + rect.width + 6, y: rect.y, width: 20, height: 20 },
    contents: 'Looks good to us.',
  });
  made.value.comment = true;
}

async function addField() {
  const widget = signatureWidget();
  if (!widget) return;
  const { rect } = widget;
  await form.create({
    family: 'text',
    name: 'purchase_order',
    widgets: [
      {
        page: widget.page,
        rect: { x: rect.x, y: rect.y + rect.height + 36, width: rect.width, height: 24 },
      },
    ],
  });
  made.value.field = true;
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!signed || made.comment" @click="addComment">
      Add a comment
    </button>
    <button type="button" class="button" :disabled="!signed || made.field" @click="addField">
      Add a form field
    </button>
    <output class="readout">
      {{
        signed
          ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
          : 'Opening…'
      }}
    </output>
    <output v-if="warning" class="warning">{{ warning }}</output>
  </div>
</template>
