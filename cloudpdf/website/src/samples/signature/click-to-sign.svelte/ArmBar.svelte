<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';
  import { useStamp, useStampState } from '@embedpdf/svelte/stamp';
  import { useSignatureState, useSignerRows } from '@embedpdf/svelte/signature';

  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const stampState = useStampState();
  const signatureState = useSignatureState();
  const rows = useSignerRows();
  const status = useFormState((formState) => formState.status);
  const mark = $derived(rows.current[0]?.signatures[0]);

  // On load: the agreement, where the form's signature field is, and a person's signature, armed.
  let done = false;
  $effect(() => {
    if (status.current !== 'ready' || done) return;
    done = true;
    untrack(async () => {
      // Bring the agreement's signature field into view.
      const [widget] = form.getWidgets(toFieldRef('approval'));
      if (widget) stage.reveal(widget.page, { rect: widget.rect });
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
    // Ada's signature, once she signs: the agreement already carries Lanternfield's.
    const signed = signatureState.signatures.find((each) => each.fieldName === 'approval');
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
