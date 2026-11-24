<!-- A signer pressed their signature field, with a click or with Tab and Space: the field is the
     signature plugin's target, and this card opens next to it. What they draw goes into the field. -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useForm, useFormWidgetAnchor } from '@embedpdf/svelte/form';
  import { useSignature, useSignatureState } from '@embedpdf/svelte/signature';

  const INK = '#1d2b53';
  type Point = { x: number; y: number };

  const form = useForm();
  const signature = useSignature();
  const signatureState = useSignatureState();
  const anchor = useFormWidgetAnchor(() =>
    signatureState.target ? (form.getWidgets(signatureState.target)[0]?.ref ?? null) : null,
  );
  let card = $state<HTMLDivElement | null>(null);
  let pad = $state<HTMLCanvasElement | null>(null);
  let drawn = $state(false);
  let last: Point | null = null;

  // Each field starts with an empty pad, and the card takes the cursor, so Escape closes it.
  $effect(() => {
    const field = signatureState.target;
    last = null;
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
    drawn = true;
  };

  // Close without signing, and put the cursor back on the field.
  const close = () => {
    const field = signatureState.target;
    signature.setTarget(null);
    if (field) form.focus(field);
  };

  // The drawing goes into the field as a picture.
  const sign = () => {
    const field = signatureState.target;
    pad?.toBlob(async (png) => {
      if (!field || !png) return;
      await signature.placeMark({ source: png }, { field });
      form.focus(field);
    });
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
