import { createCapabilityToken } from '@embedpdf/vue/runtime';
import type { StageCapability } from '@embedpdf/vue/stage';

// The strip is a second view of the document, with its own token and settings.
export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
