/**
 * Default HuggingFace URLs for built-in models.
 */
export const DEFAULT_MODEL_URLS: Record<string, string> = {
  'layout-detection':
    'https://huggingface.co/datasets/embedpdf/embed-pdf-viewer/resolve/main/models/PP-DocLayoutV3-ONNX/model_fp16.onnx',
  'table-structure':
    'https://huggingface.co/datasets/embedpdf/embed-pdf-viewer/resolve/main/models/table-transformer-structure-recognition-ONNX/model_quantized.onnx',
};

/**
 * Resolve the URL for a model, using a user override or the default registry.
 */
export function resolveModelUrl(modelId: string, overrideUrl?: string): string {
  if (overrideUrl) return overrideUrl;
  const defaultUrl = DEFAULT_MODEL_URLS[modelId];
  if (!defaultUrl) {
    throw new Error(
      `Unknown model "${modelId}". Provide a URL via config.models['${modelId}'].url`,
    );
  }
  return defaultUrl;
}
