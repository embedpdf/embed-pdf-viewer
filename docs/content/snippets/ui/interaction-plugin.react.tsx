import { interactionPlugin } from '@embedpdf/react/interaction';
import { renderPlugin } from '@embedpdf/react/render';
import { stagePlugin } from '@embedpdf/react/stage';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];
