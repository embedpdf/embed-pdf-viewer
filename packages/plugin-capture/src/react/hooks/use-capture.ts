import { useCapability, usePlugin } from '@embedpdf/core/react';
import { CapturePlugin } from '@embedpdf/plugin-capture';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);
