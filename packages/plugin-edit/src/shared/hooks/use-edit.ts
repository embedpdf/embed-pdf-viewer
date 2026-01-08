import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { EditPlugin } from '@embedpdf/plugin-edit';

export const useEditCapability = () => useCapability<EditPlugin>(EditPlugin.id);
export const useEditPlugin = () => usePlugin<EditPlugin>(EditPlugin.id);
