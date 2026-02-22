import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { AiManagerPlugin } from '@embedpdf/plugin-ai-manager';

export const useAiManagerPlugin = () => usePlugin<AiManagerPlugin>(AiManagerPlugin.id);
export const useAiManagerCapability = () => useCapability<AiManagerPlugin>(AiManagerPlugin.id);
