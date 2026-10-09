import { renderPlugin } from '@embedpdf/react/render';
import { searchPlugin } from '@embedpdf/react/search';
import { stagePlugin } from '@embedpdf/react/stage';

export const plugins = [stagePlugin({ layout: 'horizontal' }), renderPlugin(), searchPlugin()];
