import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { BookmarkPlugin } from '@embedpdf/plugin-bookmark';

export const useBookmarkPlugin = () => usePlugin<BookmarkPlugin>(BookmarkPlugin.id);
export const useBookmarkCapability = () => useCapability<BookmarkPlugin>(BookmarkPlugin.id);
