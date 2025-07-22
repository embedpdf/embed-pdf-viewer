import { useCapability, usePlugin } from '@embedpdf/core/preact';
import { RichTextPlugin } from '@embedpdf/plugin-rich-text';

export const useRichTextPlugin = () => usePlugin<RichTextPlugin>(RichTextPlugin.id);
export const useRichTextCapability = () => useCapability<RichTextPlugin>(RichTextPlugin.id);
