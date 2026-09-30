import { createCapabilityToken } from '@embedpdf/react/runtime';
import { stagePlugin, type StageCapability } from '@embedpdf/react/stage';

export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

export const plugins = [
  stagePlugin(),
  stagePlugin({
    id: 'stage-thumbs',
    token: ThumbsToken,
    interaction: false, // a drag doesn't select text or draw
    zoomGestures: false, // a pinch doesn't resize the thumbnails
    zoom: { pageWidth: 120 },
    gap: { px: 12 },
    pageFrame: { bottom: 20 }, // room for the page number
  }),
];
