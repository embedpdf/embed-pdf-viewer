import { stagePlugin } from '@embedpdf/react/stage';
import { renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { selectionPlugin } from '@embedpdf/react/selection';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];
