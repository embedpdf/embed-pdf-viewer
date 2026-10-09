<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';
  import { useStamp } from '@embedpdf/svelte/stamp';
  import {
    useSignature,
    useSignatureEvent,
    useSignatureState,
  } from '@embedpdf/svelte/signature';

  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const annotation = useAnnotation();
  const signature = useSignature();
  const signatureState = useSignatureState();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  const page = $derived(pages.current.at(-1)?.ref);
  const signed = $derived(signatureState.signatures[0]);
  let warning = $state<string | null>(null);

  // On load: a signature field on the last page, signed by Ada with a typed signature.
  let done = false;
  $effect(() => {
    const last = page;
    if (status.current !== 'ready' || !last || done) return;
    done = true;
    untrack(async () => {
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page: last, rect: { x: 72, y: 560, width: 220, height: 64 } }],
      });
      stage.goToPage(last);
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      await signature.sign({ field: toFieldRef('approval'), mark: { assetId: asset.id } });
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

  function drawBox() {
    if (!page) return;
    void annotation.create(page, {
      subtype: 'square',
      box: { x: 320, y: 560, width: 140, height: 64 },
      color: '#e11d48',
      strokeWidth: 2,
    });
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!signed || !page} onclick={drawBox}>
    Draw a box on the page
  </button>
  <output class="readout">
    {signed
      ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
      : 'Signing…'}
  </output>
  {#if warning}<output class="warning">{warning}</output>{/if}
</div>
