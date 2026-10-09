import { createCapabilityToken } from '@embedpdf/vue/runtime';
import { stagePlugin, type StageCapability } from '@embedpdf/vue/stage';

export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

export const plugins = [
  stagePlugin(), // the main view
  stagePlugin({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', zoom: { pageWidth: 120 } }),
];
