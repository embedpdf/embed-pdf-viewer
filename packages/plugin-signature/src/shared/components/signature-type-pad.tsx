import { useEffect, useRef, useState, useCallback } from '@framework';
import { SignatureStampFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';
import { cropCanvas } from './crop-canvas';

export interface SignatureTypePadHandle {
  clear(): void;
}

export interface SignatureTypePadProps {
  onResult: (result: SignatureStampFieldDefinition | null) => void;
  padRef?: (handle: SignatureTypePadHandle | null) => void;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  className?: string;
  placeholder?: string;
}

export function SignatureTypePad({
  onResult,
  padRef,
  fontFamily = "'Dancing Script', cursive",
  fontSize = 48,
  color = '#000000',
  className,
  placeholder = 'Type your signature...',
}: SignatureTypePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useRef(`sig-type-${Math.random().toString(36).slice(2, 8)}`).current;
  const sizeRef = useRef({ width: 0, height: 0 });
  const [text, setText] = useState('');
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const renderText = useCallback(
    (currentText: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      const cropped = cropCanvas(canvas, Math.ceil(4 * dpr));
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
    },
    [onResult, color, fontSize, fontFamily, dpr],
  );

  const renderTextRef = useRef(renderText);
  renderTextRef.current = renderText;
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        sizeRef.current = { width: Math.round(w), height: Math.round(h) };
        renderTextRef.current(textRef.current);
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    renderText(text);
  }, [text, fontFamily, renderText]);

  const handleClear = useCallback(() => {
    setText('');
    onResult(null);
  }, [onResult]);

  useEffect(() => {
    padRef?.({ clear: handleClear });
    return () => padRef?.(null);
  }, [padRef, handleClear]);

  const handleTextChange = useCallback((e: Event) => {
    setText((e.target as HTMLInputElement).value);
  }, []);

  return (
    <div ref={wrapperRef} className={className} style={{ width: '100%', height: '100%' }}>
      <style>{`#${inputId}::placeholder { color: ${color}; opacity: 0.5; }`}</style>
      <input
        id={inputId}
        type="text"
        value={text}
        onInput={handleTextChange as any}
        placeholder={placeholder}
        style={{
          fontFamily,
          fontSize: `${Math.min(fontSize, 32)}px`,
          color,
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          textIndent: '8px',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
