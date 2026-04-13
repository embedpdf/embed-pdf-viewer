<script lang="ts">
  import { SignatureInkFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
  import { cropCanvas } from '../../shared/components/crop-canvas';

  interface Props {
    onResult: (result: SignatureInkFieldDefinition | null) => void;
    strokeColor?: string;
    strokeWidth?: number;
    class?: string;
  }

  let {
    onResult,
    strokeColor = '#000000',
    strokeWidth = 4,
    class: className = '',
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let strokes = $state<Array<{ points: Array<{ x: number; y: number }> }>>([]);
  let isDrawing = false;
  let size = { width: 0, height: 0 };
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  function getCanvasPos(e: PointerEvent): { x: number; y: number } {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasEl.width / dpr / rect.width),
      y: (e.clientY - rect.top) * (canvasEl.height / dpr / rect.height),
    };
  }

  function redraw(currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of currentStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function emitResult(currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) {
    if (currentStrokes.length === 0 || currentStrokes.every((s) => s.points.length < 2)) {
      onResult(null);
      return;
    }

    if (!canvasEl) return;

    const cropped = cropCanvas(canvasEl, Math.ceil(strokeWidth * dpr));
    if (!cropped) {
      onResult(null);
      return;
    }

    const offsetX = cropped.bounds.x / dpr;
    const offsetY = cropped.bounds.y / dpr;
    const croppedWidth = Math.round(cropped.bounds.width / dpr);
    const croppedHeight = Math.round(cropped.bounds.height / dpr);

    const result: SignatureInkFieldDefinition = {
      creationType: SignatureCreationType.Draw,
      inkData: {
        inkList: currentStrokes
          .filter((s) => s.points.length >= 2)
          .map((s) => ({
            points: s.points.map((p) => ({
              x: p.x - offsetX,
              y: p.y - offsetY,
            })),
          })),
        strokeWidth,
        strokeColor,
        size: { width: croppedWidth, height: croppedHeight },
      },
      previewDataUrl: cropped.canvas.toDataURL('image/png'),
    };

    onResult(result);
  }

  export function clear() {
    strokes = [];
    redraw([]);
    onResult(null);
  }

  function handlePointerDown(e: PointerEvent) {
    isDrawing = true;
    const pos = getCanvasPos(e);
    strokes = [...strokes, { points: [pos] }];
    redraw(strokes);
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    const last = strokes[strokes.length - 1];
    if (last) {
      last.points.push(pos);
      strokes = [...strokes];
      redraw(strokes);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    isDrawing = false;
    (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    emitResult(strokes);
  }

  $effect(() => {
    if (!canvasEl) return;
    const observer = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0 && canvasEl) {
        size = { width: Math.round(w), height: Math.round(h) };
        canvasEl.width = Math.round(w) * dpr;
        canvasEl.height = Math.round(h) * dpr;
        redraw(strokes);
      }
    });
    observer.observe(canvasEl);
    return () => observer.disconnect();
  });

  $effect(() => {
    // Re-render when strokeColor or strokeWidth changes
    void strokeColor;
    void strokeWidth;
    redraw(strokes);
    if (strokes.length > 0 && strokes.some((s) => s.points.length >= 2)) {
      emitResult(strokes);
    }
  });
</script>

<canvas
  bind:this={canvasEl}
  class={className}
  style="touch-action: none; width: 100%; height: 100%; display: block;"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
></canvas>
