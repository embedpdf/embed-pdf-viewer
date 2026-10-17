import { createCapabilityToken } from '@embedpdf/svelte/runtime';
import { stagePlugin, type StageCapability } from '@embedpdf/svelte/stage';

export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

export const plugins = [
  stagePlugin(), // the main view
  stagePlugin({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', zoom: { pageWidth: 120 } }),
];
