import { useRef, useState, useCallback } from '@framework';
import { SignatureStampFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';

export interface UseSignatureUploadOptions {
  accept?: string;
  onResult: (result: SignatureStampFieldDefinition | null) => void;
}

export interface UseSignatureUploadReturn {
  inputRef: { current: HTMLInputElement | null };
  openFilePicker: () => void;
  processFile: (file: File) => void;
  handleFileInputChange: (e: Event) => void;
  handleDrop: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
  handleDragLeave: () => void;
  previewUrl: string | null;
  isDragging: boolean;
  clear: () => void;
  accept: string;
}

export function useSignatureUpload({
  accept = 'image/png,image/jpeg,image/svg+xml',
  onResult,
}: UseSignatureUploadOptions): UseSignatureUploadReturn {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: file.type });
        const dataUrl = URL.createObjectURL(blob);

        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return dataUrl;
        });

        const img = new Image();
        img.onload = () => {
          const previewCanvas = document.createElement('canvas');
          previewCanvas.width = img.width;
          previewCanvas.height = img.height;
          const ctx = previewCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }

          const result: SignatureStampFieldDefinition = {
            creationType: SignatureCreationType.Upload,
            imageMimeType: file.type,
            imageSize: { width: img.width, height: img.height },
            previewDataUrl: previewCanvas.toDataURL('image/png'),
            imageData: arrayBuffer,
          };
          onResult(result);
        };
        img.src = dataUrl;
      };
      reader.readAsArrayBuffer(file);
    },
    [onResult],
  );

  const handleFileInputChange = useCallback(
    (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) {
        processFile(files[0]);
      }
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files[0]) {
        processFile(files[0]);
      }
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onResult(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onResult]);

  return {
    inputRef,
    openFilePicker,
    processFile,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    previewUrl,
    isDragging,
    clear,
    accept,
  };
}
