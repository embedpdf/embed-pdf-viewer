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
  readonly previewUrl: string | null;
  readonly isDragging: boolean;
  clear: () => void;
  accept: string;
}

export function useSignatureUpload({
  accept = 'image/png,image/jpeg,image/svg+xml',
  onResult,
}: UseSignatureUploadOptions): UseSignatureUploadReturn {
  const inputRef = { current: null as HTMLInputElement | null };
  let previewUrl = $state<string | null>(null);
  let isDragging = $state(false);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: file.type });
      const dataUrl = URL.createObjectURL(blob);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = dataUrl;

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
  }

  function handleFileInputChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function clear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    onResult(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return {
    inputRef,
    openFilePicker,
    processFile,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    get previewUrl() {
      return previewUrl;
    },
    get isDragging() {
      return isDragging;
    },
    clear,
    accept,
  };
}
