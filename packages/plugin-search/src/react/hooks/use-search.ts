import { useCapability, usePlugin } from '@embedpdf/core/react';
import { SearchPlugin } from '@embedpdf/plugin-search';

export const useSearch = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);
