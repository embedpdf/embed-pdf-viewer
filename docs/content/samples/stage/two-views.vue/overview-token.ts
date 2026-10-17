import { createCapabilityToken } from '@embedpdf/vue/runtime';
import type { StageCapability } from '@embedpdf/vue/stage';

// A second view of the same document: its own id and token, its own zoom and layout.
export const OverviewToken = createCapabilityToken<StageCapability>('stage-overview');
