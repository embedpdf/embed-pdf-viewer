import { ref, type Ref } from 'vue';
import { SignatureStampFieldDefinition, SignatureCreationType } from '@embedpdf/plugin-signature';

export interface UseSignatureUploadOptions {
  accept?: string;
  onResult: (result: SignatureStampFieldDefinition | null) => void;
}

export interface UseSignatureUploadReturn {
  inputRef: Ref<HTMLInputElement | null>;
  openFilePicker: () => void;
  processFile: (file: File) => void;
  handleFileInputChange: (e: Event) => void;
  handleDrop: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
  handleDragLeave: () => void;
  previewUrl: Ref<string | null>;
  isDragging: Ref<boolean>;
  clear: () => void;
  accept: string;
}

export function useSignatureUpload({
  accept = 'image/png,image/jpeg,image/svg+xml',
  onResult,
}: UseSignatureUploadOptions): UseSignatureUploadReturn {
  const inputRef = ref<HTMLInputElement | null>(null);
  const previewUrl = ref<string | null>(null);
  const isDragging = ref(false);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: file.type });
      const dataUrl = URL.createObjectURL(blob);

      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = dataUrl;

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
    isDragging.value = false;
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging.value = true;
  }

  function handleDragLeave() {
    isDragging.value = false;
  }

  function openFilePicker() {
    inputRef.value?.click();
  }

  function clear() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
    onResult(null);
    if (inputRef.value) {
      inputRef.value.value = '';
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
    previewUrl,
    isDragging,
    clear,
    accept,
  };
}
