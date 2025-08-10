import { PdfAnnotationSubtype, PdfStampAnnoObject, Rect, uuidV4 } from '@embedpdf/models';
import { useState, useEffect, useMemo, useRef, ChangeEvent, Fragment } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '../../hooks';

interface StampPaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export const StampPaint = ({ pageIndex, scale, pageWidth, pageHeight }: StampPaintProps) => {
  /* ------------------------------------------------------------------ */
  /* annotation capability                                              */
  /* ------------------------------------------------------------------ */
  const { provides: annotationProvides } = useAnnotationCapability();

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ------------------------------------------------------------------ */
  /* active tool state                                                  */
  /* ------------------------------------------------------------------ */
  const [activeTool, setActiveTool] = useState<ActiveTool>({ variantKey: null, defaults: null });

  useEffect(() => {
    if (!annotationProvides) return;
    return annotationProvides.onActiveToolChange(setActiveTool);
  }, [annotationProvides]);

  /* ------------------------------------------------------------------ */
  /* integration with interaction-manager                               */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: 'stamp', pageIndex });

  /* page size in **PDF-space** (unscaled) ----------------------------- */
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const handlers = useMemo<PointerEventHandlers<PointerEvent>>(
    () => ({
      onPointerDown: (pos, evt) => {
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);
        setStart({ x, y });
        inputRef.current?.click();
      },
    }),
    [pageWidthPDF, pageHeightPDF],
  );

  /* register with the interaction-manager */
  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.STAMP)
    return null;

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!annotationProvides || !start) return;

    const file = e.currentTarget.files?.[0];
    if (!file) return;

    /* --------------------------------------------------------------- *
     * 1. Load image (keep full resolution)                            *
     * --------------------------------------------------------------- */
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    /* --------------------------------------------------------------- *
     * 2. Decide rect that keeps stamp on page                         *
     * --------------------------------------------------------------- */
    const maxW = pageWidthPDF;
    const maxH = pageHeightPDF;

    // how much can we scale without overflowing?
    const scaleFactor = Math.min(1, maxW / imgW, maxH / imgH);
    const pdfW = imgW * scaleFactor;
    const pdfH = imgH * scaleFactor;

    // If the stamp would overflow → shift it so it stays fully visible
    const posX = clamp(start.x, 0, maxW - pdfW);
    const posY = clamp(start.y, 0, maxH - pdfH);

    const rect: Rect = {
      origin: { x: posX, y: posY },
      size: { width: pdfW, height: pdfH },
    };

    /* --------------------------------------------------------------- *
     * 3. Copy pixels to ImageData (original resolution)               *
     * --------------------------------------------------------------- */
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = pdfW;
    canvas.height = pdfH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, pdfW, pdfH);
    const imageData = ctx.getImageData(0, 0, pdfW, pdfH);

    const anno: PdfStampAnnoObject = {
      type: PdfAnnotationSubtype.STAMP,
      flags: ['print'],
      pageIndex,
      id: uuidV4(),
      created: new Date(),
      rect,
    };

    annotationProvides.createAnnotation(pageIndex, anno, { imageData });
    annotationProvides.setActiveVariant(null);
    annotationProvides.selectAnnotation(pageIndex, anno.id);

    setStart(null);
  };

  return (
    <Fragment>
      <canvas style={{ display: 'none' }} ref={canvasRef} />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={onChange}
      />
    </Fragment>
  );
};
