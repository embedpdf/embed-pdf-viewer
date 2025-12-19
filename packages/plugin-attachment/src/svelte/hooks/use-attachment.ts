import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { AttachmentPlugin } from '@embedpdf/plugin-attachment';

export const useAttachmentPlugin = () => usePlugin<AttachmentPlugin>(AttachmentPlugin.id);
export const useAttachmentCapability = () => useCapability<AttachmentPlugin>(AttachmentPlugin.id);
