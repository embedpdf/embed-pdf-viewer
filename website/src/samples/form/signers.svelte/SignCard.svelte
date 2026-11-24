<!-- A signer pressed their signature field, with a click or with Tab and Space: the field is the
     signature plugin's target, and this card opens next to it. What they draw goes into the field. -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useForm, useFormWidgetAnchor } from '@embedpdf/svelte/form';
  import { useStamp } from '@embedpdf/svelte/stamp';
  import { useSignature, useSignatureState } from '@embedpdf/svelte/signature';

  const INK = '#1d2b53';
  type Point = { x: number; y: number };

  const form = useForm();
  const stamp = useStamp();
  const signature = useSignature();
  const signatureState = useSignatureState();
  const anchor = useFormWidgetAnchor(() =>
    signatureState.target ? (form.getWidgets(signatureState.target)[0]?.ref ?? null) : null,
  );
  let card = $state<HTMLDivElement | null>(null);
  let pad = $state<HTMLCanvasElement | null>(null);
  let drawn = $state(false);
  let strokes: Point[][] = [];

  // Each field starts with an empty pad, and the card takes the cursor, so Escape closes it.
  $effect(() => {
    const field = signatureState.target;
    strokes = [];
    drawn = false;
    pad?.getContext('2d')?.clearRect(0, 0, pad.width, pad.height);
    if (field) card?.focus();
  });

  const pointOf = (event: PointerEvent, canvas: HTMLCanvasElement): Point => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const start = (event: PointerEvent) => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(event.pointerId);
    strokes.push([pointOf(event, canvas)]);
  };

  const draw = (event: PointerEvent) => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const stroke = strokes.at(-1);
    const ink = canvas.getContext('2d');
    if (!stroke || !ink || !canvas.hasPointerCapture(event.pointerId)) return;
    const from = stroke.at(-1)!;
    const to = pointOf(event, canvas);
    stroke.push(to);
    ink.strokeStyle = INK;
    ink.lineWidth = 2;
    ink.lineCap = 'round';
    ink.beginPath();
    ink.moveTo(from.x, from.y);
    ink.lineTo(to.x, to.y);
    ink.stroke();
    drawn = true;
  };

  // Close without signing, and put the cursor back on the field.
  const close = () => {
    const field = signatureState.target;
    signature.setTarget(null);
    if (field) form.focus(field);
  };

  // The drawing becomes a stamp among the signer's marks, and the stamp goes into the field.
  const sign = async () => {
    const field = signatureState.target;
    if (!field) return;
    const library =
      stamp.listLibraries().find((each) => each.name === 'Signatures') ??
      (await stamp.createLibrary('Signatures', { kind: 'signatures' })).library;
    // A new drawing takes the place of the one drawn before.
    const before = stamp
      .listAssets({ libraryId: library.id })
      .find((each) => each.name === 'signature');
    if (before) await stamp.deleteAsset(before.id);
    const { asset } = await stamp.createAsset({
      libraryId: library.id,
      name: 'signature',
      label: 'Signature',
      mark: { kind: 'ink', strokes, color: INK, strokeWidth: 2 },
    });
    await signature.placeMark({ assetId: asset.id }, { field });
    form.focus(field);
  };
</script>

{#if signatureState.target}
  <Anchored anchor={anchor.current} placement="bottom-start" gap={8}>
    <div
      bind:this={card}
      class="sign-card"
      role="dialog"
      aria-label="Draw your signature"
      tabindex="-1"
      onkeydown={(event) => event.key === 'Escape' && close()}
    >
      <!-- Anchored UI keeps a press from reaching the page under it, before Svelte hears it: the
           pad listens while the press is on its way down. -->
      <canvas
        bind:this={pad}
        class="sign-pad"
        width="240"
        height="100"
        onpointerdowncapture={start}
        onpointermove={draw}
      ></canvas>
      <div class="sign-actions">
        <button type="button" class="button" onclick={close}>Cancel</button>
        <button type="button" class="button" disabled={!drawn} onclick={sign}>Sign</button>
      </div>
    </div>
  </Anchored>
{/if}
