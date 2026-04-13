import { useEffect, useRef, useState, useCallback } from '@framework';
import { SignatureInkFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
import { cropCanvas } from './crop-canvas';

export interface SignatureDrawPadHandle {
  clear(): void;
}

export interface SignatureDrawPadProps {
  onResult: (result: SignatureInkFieldDefinition | null) => void;
  padRef?: (handle: SignatureDrawPadHandle | null) => void;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
}

export function SignatureDrawPad({
  onResult,
  padRef,
  strokeColor = '#000000',
  strokeWidth = 4,
  className,
}: SignatureDrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Array<{ points: Array<{ x: number; y: number }> }>>([]);
  const isDrawingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const getCanvasPos = useCallback(
    (e: PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / dpr / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / dpr / rect.height),
      };
    },
    [dpr],
  );

  const redraw = useCallback(
    (currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    },
    [dpr, strokeColor, strokeWidth],
  );

  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;

  const emitResult = useCallback(
    (currentStrokes: Array<{ points: Array<{ x: number; y: number }> }>) => {
      if (currentStrokes.length === 0 || currentStrokes.every((s) => s.points.length < 2)) {
        onResult(null);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const cropped = cropCanvas(canvas, Math.ceil(strokeWidth * dpr));
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
    },
    [onResult, strokeWidth, strokeColor, dpr],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        sizeRef.current = { width: Math.round(w), height: Math.round(h) };
        canvas.width = Math.round(w) * dpr;
        canvas.height = Math.round(h) * dpr;
        redrawRef.current(strokesRef.current);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [dpr]);

  useEffect(() => {
    redraw(strokes);
    if (strokes.length > 0 && strokes.some((s) => s.points.length >= 2)) {
      emitResult(strokes);
    }
  }, [strokeColor, strokeWidth]);

  const handleClear = useCallback(() => {
    setStrokes([]);
    redraw([]);
    onResult(null);
  }, [redraw, onResult]);

  useEffect(() => {
    padRef?.({ clear: handleClear });
    return () => padRef?.(null);
  }, [padRef, handleClear]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      isDrawingRef.current = true;
      const pos = getCanvasPos(e);
      const newStrokes = [...strokes, { points: [pos] }];
      setStrokes(newStrokes);
      redraw(newStrokes);
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    },
    [strokes, getCanvasPos, redraw],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pos = getCanvasPos(e);
      const newStrokes = [...strokes];
      const last = newStrokes[newStrokes.length - 1];
      if (last) {
        last.points.push(pos);
        setStrokes(newStrokes);
        redraw(newStrokes);
      }
    },
    [strokes, getCanvasPos, redraw],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      isDrawingRef.current = false;
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      emitResult(strokes);
    },
    [strokes, emitResult],
  );

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', width: '100%', height: '100%', display: 'block' }}
      onPointerDown={handlePointerDown as any}
      onPointerMove={handlePointerMove as any}
      onPointerUp={handlePointerUp as any}
    />
  );
}
