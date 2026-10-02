import { renderPlugin } from '@embedpdf/svelte/render';
import { searchPlugin } from '@embedpdf/svelte/search';
import { stagePlugin } from '@embedpdf/svelte/stage';

export const plugins = [stagePlugin({ layout: 'horizontal' }), renderPlugin(), searchPlugin()];
