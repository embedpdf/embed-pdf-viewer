import { createCapabilityToken } from '@embedpdf/svelte/runtime';
import type { StageCapability } from '@embedpdf/svelte/stage';

// The strip is a second view of the document, with its own token and settings.
export const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
