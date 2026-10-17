import { stagePlugin } from '@embedpdf/svelte/stage';
import { renderPlugin } from '@embedpdf/svelte/render';
import { interactionPlugin } from '@embedpdf/svelte/interaction';
import { selectionPlugin } from '@embedpdf/svelte/selection';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];
