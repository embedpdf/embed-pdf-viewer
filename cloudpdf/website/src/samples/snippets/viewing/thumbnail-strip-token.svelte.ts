import { createCapabilityToken } from '@embedpdf/svelte/runtime';
import { stagePlugin, type StageCapability } from '@embedpdf/svelte/stage';

export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

export const plugins = [
  stagePlugin(),
  stagePlugin({
    id: 'stage-thumbs',
    token: ThumbsToken,
    zoom: { pageWidth: 120 },
    gap: { px: 12 },
    pageFrame: { bottom: 20 }, // room for the page number
  }),
];
