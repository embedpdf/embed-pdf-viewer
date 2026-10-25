<!-- Two edits after an approval signature: a comment keeps it valid, a new form field breaks it. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';
  import {
    useSignature,
    useSignatureEvent,
    useSignatureState,
  } from '@embedpdf/svelte/signature';

  // EmbedPDF's signature field, signed before the agreement was sent.
  const EMBEDPDF = toFieldRef('embedpdf');

  const form = useForm();
  const stage = useStage();
  const annotation = useAnnotation();
  const signature = useSignature();
  const signatureState = useSignatureState();
  const status = useFormState((formState) => formState.status);
  const signed = $derived(signatureState.signatures.find((each) => each.signed));
  let warning = $state<string | null>(null);
  let made = $state({ comment: false, field: false });

  // Where the signature is: the edits go next to it.
  function signatureWidget() {
    return form.getWidgets(EMBEDPDF)[0];
  }

  // On load: the signatures, in view. Nothing is changed until a button is pressed.
  let revealed = false;
  $effect(() => {
    if (status.current !== 'ready' || revealed) return;
    revealed = true;
    untrack(() => {
      const widget = signatureWidget();
      if (widget) stage.reveal(widget.page, { rect: widget.rect });
    });
  });

  // The moment a change would break a signature once it's saved, as Acrobat warns.
  useSignatureEvent(
    (plugin) => plugin.onInvalidationPredicted,
    ({ field }) => {
      const name = signature.getSignature(field)?.fieldName;
      warning = `This change will break the signature in "${name}" when saved.`;
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
    made.comment = true;
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
    made.field = true;
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!signed || made.comment} onclick={addComment}>
    Add a comment
  </button>
  <button type="button" class="button" disabled={!signed || made.field} onclick={addField}>
    Add a form field
  </button>
  <output class="readout">
    {signed
      ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
      : 'Opening…'}
  </output>
  {#if warning}<output class="warning">{warning}</output>{/if}
</div>
