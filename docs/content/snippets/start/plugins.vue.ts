import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { selectionPlugin } from '@embedpdf/vue/selection';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];
