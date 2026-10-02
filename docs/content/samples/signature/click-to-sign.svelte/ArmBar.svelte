<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormState } from '@embedpdf/svelte/form';
  import { useStamp, useStampState } from '@embedpdf/svelte/stamp';
  import { useSignatureState, useSignerRows } from '@embedpdf/svelte/signature';

  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const stampState = useStampState();
  const signatureState = useSignatureState();
  const rows = useSignerRows();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  const mark = $derived(rows.current[0]?.signatures[0]);

  // On load: a signature field on the last page, and a person's signature, armed.
  let done = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || done) return;
    done = true;
    untrack(async () => {
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 }, color: '#94a3b8' }],
      });
      stage.goToPage(page);
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      await stamp.armAsset(asset.id, { targetWidth: 160 });
    });
  });

  const hint = $derived.by(() => {
    const signed = signatureState.signatures[0];
    if (signed) return `The field is signed by ${signed.signer.name}`;
    if (stampState.armedAsset) return 'Click the empty field to sign it, or anywhere else to place it';
    if (mark) return 'Arm the signature, then click where it goes';
    return 'Getting ready…';
  });

  function toggleArmed() {
    if (stampState.armedAsset) stamp.disarm();
    else if (mark) void stamp.armAsset(mark.id);
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!mark}
    aria-pressed={stampState.armedAsset !== null}
    onclick={toggleArmed}
  >
    {stampState.armedAsset ? 'Disarm' : 'Arm the signature'}
  </button>
  <output class="readout">{hint}</output>
</div>
