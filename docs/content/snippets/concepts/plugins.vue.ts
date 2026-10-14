import { renderPlugin } from '@embedpdf/vue/render';
import { searchPlugin } from '@embedpdf/vue/search';
import { stagePlugin } from '@embedpdf/vue/stage';

export const plugins = [stagePlugin({ layout: 'horizontal' }), renderPlugin(), searchPlugin()];
