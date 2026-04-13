<script lang="ts">
  import { SignatureStampFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
  import { cropCanvas } from '../../shared/components/crop-canvas';

  interface Props {
    onResult: (result: SignatureStampFieldDefinition | null) => void;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    class?: string;
    placeholder?: string;
  }

  let {
    onResult,
    fontFamily = "'Dancing Script', cursive",
    fontSize = 48,
    color = '#000000',
    class: className = '',
    placeholder = 'Type your signature...',
  }: Props = $props();

  let wrapperEl: HTMLDivElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let text = $state('');
  let size = { width: 0, height: 0 };
  const inputId = `sig-type-${Math.random().toString(36).slice(2, 8)}`;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  function renderText(currentText: string) {
    if (!canvasEl) return;

    const { width, height } = size;
    if (width === 0 || height === 0) return;

    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (!currentText.trim()) {
      onResult(null);
      return;
    }

    ctx.scale(dpr, dpr);
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(currentText, width / 2, height / 2, width - 20);

    const cropped = cropCanvas(canvasEl, Math.ceil(4 * dpr));
    if (!cropped) {
      onResult(null);
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
        onResult(result);
      });
    }, 'image/png');
  }

  export function clear() {
    text = '';
    onResult(null);
  }

  function handleInput(e: Event) {
    text = (e.target as HTMLInputElement).value;
  }

  $effect(() => {
    if (!wrapperEl) return;
    const observer = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        size = { width: Math.round(w), height: Math.round(h) };
        renderText(text);
      }
    });
    observer.observe(wrapperEl);
    return () => observer.disconnect();
  });

  $effect(() => {
    void fontFamily;
    void color;
    renderText(text);
  });
</script>

<div bind:this={wrapperEl} class={className} style="width: 100%; height: 100%;">
  {@html `<style>#${inputId}::placeholder { color: ${color}; opacity: 0.5; }</style>`}
  <input
    id={inputId}
    type="text"
    value={text}
    oninput={handleInput}
    {placeholder}
    style="font-family: {fontFamily}; font-size: {Math.min(
      fontSize,
      32,
    )}px; color: {color}; width: 100%; height: 100%; border: none; outline: none; background: transparent; text-indent: 8px;"
  />
  <canvas bind:this={canvasEl} style="display: none;"></canvas>
</div>
