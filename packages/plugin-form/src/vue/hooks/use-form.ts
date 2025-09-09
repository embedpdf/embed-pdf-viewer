import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { FormPlugin } from '@embedpdf/plugin-form';

export const useFormPlugin = () => usePlugin<FormPlugin>(FormPlugin.id);
export const useFormCapability = () => useCapability<FormPlugin>(FormPlugin.id);
